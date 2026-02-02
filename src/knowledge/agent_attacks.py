from typing import List, Optional, Dict, Any
import logging
import asyncio
import base64
import string
from concurrent.futures import ThreadPoolExecutor

import chromadb
from chromadb.utils import embedding_functions
from pydantic import Field

from src.knowledge.taxonomy import AttackArtifact, RetrievalResult
from src.core.owasp_agentic import OWASPAgenticRisk
from src.core.schemas import AttackType, Technique

logger = logging.getLogger(__name__)

# Same safe model as attack_kb.py
SAFE_EMBEDDING_MODEL = "all-MiniLM-L6-v2"

# Precompute mapping for O(1) lookup
_OWASP_BY_VALUE = {r.value: r for r in OWASPAgenticRisk}

# Validation constants
MAX_PROMPT_LENGTH = 10000
MAX_METADATA_LENGTH = 1000
ALLOWED_METADATA_CHARS = set(string.printable)

class AgentAttackTemplate(AttackArtifact):
    """
    Represents an agent-specific attack pattern or template.
    Extends base AttackArtifact with agent capabilities and OWASP risks.
    """
    target_owasp: List[OWASPAgenticRisk] = Field(
        ..., 
        description="List of OWASP Agentic risks this attack targets"
    )
    requires_tool_access: bool = Field(
        default=False,
        description="Whether this attack requires tool execution capabilities"
    )
    requires_memory_access: bool = Field(
        default=False,
        description="Whether this attack requires long-term memory access"
    )
    expected_agent_behavior: str = Field(
        ...,
        description="Description of what the agent is expected to do if vulnerable"
    )


class AgentAttackKnowledgeBase:
    """
    RAG engine for retrieving agent-specific attack patterns.
    Uses ChromaDB collection 'agent_attacks'.
    """

    def __init__(self, persist_directory: str = "./data/chroma_db"):
        try:
            self.client = chromadb.PersistentClient(path=persist_directory)

            # Use default sentence-transformer (safe model)
            self.embedding_fn = (
                embedding_functions.SentenceTransformerEmbeddingFunction(
                    model_name=SAFE_EMBEDDING_MODEL
                )
            )

            self.collection = self.client.get_or_create_collection(
                name="agent_attacks",
                embedding_function=self.embedding_fn,  # type: ignore
                metadata={"hnsw:space": "cosine"},
            )

            self._executor = ThreadPoolExecutor(max_workers=4)
            
            # Post-init health check
            self._validate_collection_health()

        except Exception as e:
            # Log exception type only to avoid leaking sensitive info
            logger.error("Failed to initialize ChromaDB for agent attacks: %s", type(e).__name__)
            # Ensure we don't leave a dangling executor if init failed partway
            if hasattr(self, '_executor'):
                self._executor.shutdown(wait=False)
            raise

    def __del__(self):
        """Ensure executor is shut down to prevent leaks."""
        if hasattr(self, '_executor'):
            self._executor.shutdown(wait=False)
            
    def __enter__(self):
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        if hasattr(self, '_executor'):
            self._executor.shutdown(wait=True)

    def _validate_collection_health(self) -> None:
        """Verify collection is accessible and has expected schema."""
        try:
            # Simple check: can we count?
            self.collection.count()
        except Exception as e:
            raise RuntimeError(f"Collection health check failed: {type(e).__name__}") from e

    def _validate_input(self, template: AgentAttackTemplate) -> None:
        """Strict validation of input template."""
        if len(template.prompt_template) > MAX_PROMPT_LENGTH:
             raise ValueError(f"Prompt template too long: {len(template.prompt_template)}")
        
        # Check for unprintable chars in prompt (basic check)
        # Note: We allow newlines/tabs, but maybe block control chars
        # For now, just length check is critical.
        
        # Validate metadata fields
        for field in [template.source, template.target_goal, template.description]:
            if field and len(field) > MAX_METADATA_LENGTH:
                 raise ValueError(f"Metadata field too long: {len(field)}")
            if field and not all(c in ALLOWED_METADATA_CHARS for c in field):
                 # Logging this might be noisy if just unicode, but for security strictness:
                 # We'll allow printable unicode if needed, but string.printable is ASCII-only.
                 # Let's stick to printable ASCII for now for metadata safety.
                 raise ValueError("Metadata contains invalid characters")

        if not template.target_owasp:
             raise ValueError("target_owasp cannot be empty")

    def add(self, template: AgentAttackTemplate) -> None:
        """
        Adds a single agent attack template to the KB.
        """
        # Strict validation
        self._validate_input(template)

        # 1. Compute embedding on raw text
        embeddings = self.embedding_fn([template.prompt_template])

        # 2. Encode text for format/storage (NOT encryption)
        # We store base64 to avoid encoding issues in Chroma/JSON serialization
        encoded_prompt = base64.b64encode(
            template.prompt_template.encode("utf-8")
        ).decode("utf-8")

        # Convert enum list to comma-separated strings for metadata storage
        # Validation guarantees these are valid Enums
        owasp_tags = ",".join([risk.value for risk in template.target_owasp])

        self.collection.add(
            documents=[encoded_prompt],
            embeddings=embeddings,
            metadatas=[
                {
                    "type": template.attack_type.value,
                    "technique": template.technique.value,
                    "source": template.source,
                    "target_goal": template.target_goal,
                    "sophistication": template.sophistication,
                    "known_success": template.known_success,
                    "description": template.description or "",
                    "tags": ",".join(template.tags),
                    # Agent specific metadata
                    "target_owasp": owasp_tags,
                    "requires_tool_access": template.requires_tool_access,
                    "requires_memory_access": template.requires_memory_access,
                    "expected_agent_behavior": template.expected_agent_behavior
                }
            ],
            ids=[template.id],
        )
        logger.info(f"Added agent attack template: {template.id}")

    async def retrieve_attacks(
        self, goal: str, k: int = 5, threshold: float = 0.2
    ) -> List[AgentAttackTemplate]:
        """
        Async semantic search for attacks matching a goal.
        """
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.get_event_loop()
            
        return await loop.run_in_executor(
            self._executor, self._query_sync, goal, k, threshold
        )

    def _query_sync(
        self, goal: str, k: int = 5, threshold: float = 0.2, where: Optional[dict] = None
    ) -> List[AgentAttackTemplate]:
        """
        Internal sync query logic with optional metadata filtering.
        """
        if k <= 0:
            return []
        
        # Validate goal
        if len(goal) > MAX_METADATA_LENGTH:
             goal = goal[:MAX_METADATA_LENGTH] # Truncate query
            
        # Over-fetch to allow for post-processing/decoding and filtering
        n_results_to_fetch = k * 2
            
        results = self.collection.query(
            query_texts=[goal],
            n_results=n_results_to_fetch,
            where=where
        )

        retrieved: List[AgentAttackTemplate] = []
        
        # Safe access to results
        if not results.get("ids") or not results["ids"][0]:
            return retrieved

        ids = results["ids"][0]
        distances = results.get("distances", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        documents = results.get("documents", [[]])[0]
        
        if len(ids) != len(distances):
            logger.error("Chroma returned mismatched ids and distances")
            # Fail loudly on DB corruption
            raise RuntimeError("Database integrity violation: mismatched result arrays")

        for i, _id in enumerate(ids):
            # Cosine distance to similarity score
            # Distance is in [0, 2] for Cosine in Chroma (usually)
            distance = distances[i]
            score = 1.0 - distance

            if score < threshold:
                continue

            try:
                meta = metadatas[i]
                # Decode prompt
                decoded_prompt = base64.b64decode(documents[i]).decode("utf-8")
                
                # Reconstruct OWASP list O(1)
                owasp_str = str(meta.get("target_owasp", ""))
                owasp_list = []
                if owasp_str:
                    for code in owasp_str.split(","):
                        code = code.strip()
                        if not code:
                            continue
                        risk = _OWASP_BY_VALUE.get(code)
                        if risk:
                            owasp_list.append(risk)
                        else:
                            # Strict validation: any unknown code is corruption
                            raise ValueError(f"Unknown OWASP code '{code}' in template {_id}")
                else:
                     raise ValueError(f"Missing target_owasp in template {_id}")
                
                # Explicit enum conversion - Fail if missing
                attack_type_val = meta.get("type")
                technique_val = meta.get("technique")
                
                if not attack_type_val:
                    raise ValueError(f"Missing attack_type in template {_id}")
                if not technique_val:
                    raise ValueError(f"Missing technique in template {_id}")

                template = AgentAttackTemplate(
                    id=_id,
                    prompt_template=decoded_prompt,
                    # Base fields
                    attack_type=AttackType(attack_type_val),
                    technique=Technique(technique_val),
                    source=str(meta.get("source", "unknown")),
                    target_goal=str(meta.get("target_goal", "")),
                    sophistication=int(meta.get("sophistication", 1)),
                    known_success=bool(meta.get("known_success", False)),
                    description=str(meta.get("description", "")),
                    tags=str(meta.get("tags", "")).split(",") if meta.get("tags") else [],
                    success_rate=0.0,
                    # Agent specific fields
                    target_owasp=owasp_list,
                    requires_tool_access=bool(meta.get("requires_tool_access", False)),
                    requires_memory_access=bool(meta.get("requires_memory_access", False)),
                    expected_agent_behavior=str(meta.get("expected_agent_behavior", ""))
                )
                retrieved.append(template)
            except Exception as e:
                # Fail fast on ANY corruption in security context
                logger.error("Corruption detected in agent attack %s: %s", _id, type(e).__name__)
                raise RuntimeError(f"Database corruption detected for id={_id}") from e

        return retrieved[:k]

    def get_attacks_for_owasp(self, risk: OWASPAgenticRisk, k: int = 5) -> List[AgentAttackTemplate]:
        """
        Retrieve attacks targeting a specific OWASP category.
        Uses metadata filtering post-retrieval.
        """
        # Use the risk description as the semantic query
        query_text = f"Attacks targeting {risk.value}: {risk.description}"
        
        # Use threshold=-1.0 to ensure recall (disable threshold filtering)
        # Fetching k*4 to ensure we have enough after filtering
        results = self._query_sync(goal=query_text, k=k*4, threshold=-1.0)
        
        filtered = [
            t for t in results 
            if risk in t.target_owasp
        ]
        return filtered[:k]

    def get_attacks_by_capability(self, tools: bool = False, memory: bool = False, k: int = 5) -> List[AgentAttackTemplate]:
        """
        Retrieve attacks that match specific agent capabilities using metadata filters.
        """
        where_clause = {}
        if tools:
            where_clause["requires_tool_access"] = True
        if memory:
            where_clause["requires_memory_access"] = True
            
        query_text = "Agent security attacks"
        if tools:
            query_text += " involving tool abuse"
        if memory:
            query_text += " involving memory manipulation"
            
        # Use threshold=-1.0 to ensure metadata filter determines the result set
        return self._query_sync(goal=query_text, k=k, threshold=-1.0, where=where_clause if where_clause else None)

    def get_by_id(self, template_id: str) -> Optional[AgentAttackTemplate]:
        """Retrieve a specific template by ID."""
        results = self.collection.get(ids=[template_id])
        if not results["ids"]:
            return None

        try:
            meta = results["metadatas"][0] # type: ignore
            doc = results["documents"][0] # type: ignore
            decoded_prompt = base64.b64decode(doc).decode("utf-8") # type: ignore

            owasp_str = str(meta.get("target_owasp", ""))
            owasp_list = []
            if owasp_str:
                for code in owasp_str.split(","):
                    code = code.strip()
                    if not code:
                        continue
                    risk = _OWASP_BY_VALUE.get(code)
                    if risk:
                        owasp_list.append(risk)
                    else:
                        raise ValueError(f"Unknown OWASP code '{code}' in template {template_id}")
            else:
                 raise ValueError(f"Missing target_owasp in template {template_id}")

            # Explicit enum conversion - Fail if missing
            attack_type_val = meta.get("type")
            technique_val = meta.get("technique")
            
            if not attack_type_val:
                raise ValueError(f"Missing attack_type in template {template_id}")
            if not technique_val:
                raise ValueError(f"Missing technique in template {template_id}")

            return AgentAttackTemplate(
                id=template_id,
                prompt_template=decoded_prompt,
                attack_type=AttackType(attack_type_val),
                technique=Technique(technique_val),
                source=str(meta.get("source", "unknown")),
                target_goal=str(meta.get("target_goal", "")),
                sophistication=int(meta.get("sophistication", 1)),
                known_success=bool(meta.get("known_success", False)),
                description=str(meta.get("description", "")),
                tags=str(meta.get("tags", "")).split(",") if meta.get("tags") else [],
                success_rate=0.0,
                target_owasp=owasp_list,
                requires_tool_access=bool(meta.get("requires_tool_access", False)),
                requires_memory_access=bool(meta.get("requires_memory_access", False)),
                expected_agent_behavior=str(meta.get("expected_agent_behavior", ""))
            )
        except Exception as e:
            logger.error("Error retrieving agent attack %s: %s", template_id, type(e).__name__)
            raise RuntimeError(f"Corrupted agent attack record for id={template_id}") from e