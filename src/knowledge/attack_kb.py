# src/knowledge/attack_kb.py

import chromadb
from chromadb.utils import embedding_functions
from typing import List, Optional
import logging
import asyncio
import base64
from concurrent.futures import ThreadPoolExecutor

from src.knowledge.taxonomy import AttackArtifact, RetrievalResult
from src.core.schemas import AttackType, Technique

logger = logging.getLogger(__name__)

# CRIT-003: Hardcode model to prevent RCE via model deserialization
SAFE_EMBEDDING_MODEL = "all-MiniLM-L6-v2"


class AttackKnowledgeBase:
    """
    RAG engine for retrieving attack patterns.
    Uses local ChromaDB with Sentence Transformers.
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

            # HIGH-007: Renamed collection
            self.collection = self.client.get_or_create_collection(
                name="attack_kb",
                embedding_function=self.embedding_fn,  # type: ignore
                metadata={"hnsw:space": "cosine"},
            )

            self._executor = ThreadPoolExecutor(max_workers=4)

        except Exception as e:
            logger.error(f"Failed to initialize ChromaDB: {e}")
            raise

    # HIGH-004: Alias for spec compliance
    def ingest_data(self, artifact: AttackArtifact) -> None:
        self.add(artifact)

    def add(self, attack: AttackArtifact) -> None:
        """
        Adds a single attack artifact to the KB.
        MED-002: Base64 encodes the prompt template to prevent injection/encoding issues.
        CRITICAL FIX: Computes embedding on RAW text so semantic search works,
        but stores ENCODED text.
        """
        # 1. Compute embedding on raw text (so search works)
        # embedding_fn expects a list of docs
        embeddings = self.embedding_fn([attack.prompt_template])

        # 2. Encode text for safe storage
        encoded_prompt = base64.b64encode(
            attack.prompt_template.encode("utf-8")
        ).decode("utf-8")

        self.collection.add(
            documents=[encoded_prompt],
            embeddings=embeddings,  # Pass explicit embeddings
            metadatas=[
                {
                    "type": attack.attack_type.value,
                    "technique": attack.technique.value,
                    "source": attack.source,
                    "target_goal": attack.target_goal,
                    "sophistication": attack.sophistication,
                    "known_success": attack.known_success,
                    "description": attack.description or "",
                    "tags": ",".join(attack.tags),
                }
            ],
            ids=[attack.id],
        )
        logger.info(f"Added attack artifact: {attack.id}")

    # HIGH-005 / HIGH-002: Async retrieval
    async def retrieve_attacks(
        self, goal: str, k: int = 5, threshold: float = 0.2
    ) -> List[RetrievalResult]:
        """
        Async wrapper for query.
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor, self._query_sync, goal, k, threshold
        )

    def _query_sync(
        self, goal: str, k: int = 5, threshold: float = 0.2
    ) -> List[RetrievalResult]:
        """
        Internal sync query logic.
        """
        # Over-fetch to allow for filtering
        results = self.collection.query(query_texts=[goal], n_results=k * 2)

        retrieved: List[RetrievalResult] = []
        if not results["ids"]:
            return retrieved

        ids = results["ids"][0] if results["ids"] else []
        distances = results["distances"][0] if results["distances"] else []
        metadatas = results["metadatas"][0] if results["metadatas"] else []
        documents = results["documents"][0] if results["documents"] else []

        for i, _id in enumerate(ids):
            score = 1.0 - distances[i]  # type: ignore

            if score < threshold:
                continue

            try:
                meta = metadatas[i]
                # MED-002: Decode prompt
                decoded_prompt = base64.b64decode(documents[i]).decode("utf-8")

                artifact = AttackArtifact(
                    id=_id,
                    prompt_template=decoded_prompt,
                    attack_type=AttackType(meta["type"]),  # type: ignore
                    technique=Technique(meta["technique"]),  # type: ignore
                    source=str(meta["source"]),
                    target_goal=str(meta["target_goal"]),
                    sophistication=int(meta["sophistication"]),  # type: ignore
                    known_success=bool(meta["known_success"]),  # type: ignore
                    description=str(meta["description"]),
                    tags=str(meta["tags"]).split(",") if meta["tags"] else [],
                    success_rate=0.0,
                )
                retrieved.append(RetrievalResult(artifact=artifact, score=score))
            except Exception as e:
                logger.warning(f"Skipping malformed artifact {_id}: {e}")
                continue

        # Simple diversity filter (deduplicate by technique)
        final_results: List[RetrievalResult] = []
        seen_techniques = set()

        for res in retrieved:
            if len(final_results) >= k:
                break
            if res.artifact.technique not in seen_techniques:
                final_results.append(res)
                seen_techniques.add(res.artifact.technique)
            elif len(final_results) < k:
                # If we still need filler, add it anyway
                final_results.append(res)

        return final_results[:k]

    # HIGH-006: Missing methods
    def get_by_id(self, artifact_id: str) -> Optional[AttackArtifact]:
        results = self.collection.get(ids=[artifact_id])
        if not results["ids"]:
            return None

        meta = results["metadatas"][0]  # type: ignore
        doc = results["documents"][0]  # type: ignore
        decoded_prompt = base64.b64decode(doc).decode("utf-8")  # type: ignore

        return AttackArtifact(
            id=artifact_id,
            prompt_template=decoded_prompt,
            attack_type=AttackType(meta["type"]),  # type: ignore
            technique=Technique(meta["technique"]),  # type: ignore
            source=str(meta["source"]),
            target_goal=str(meta["target_goal"]),
            sophistication=int(meta["sophistication"]),  # type: ignore
            known_success=bool(meta["known_success"]),  # type: ignore
            description=str(meta["description"]),
            tags=str(meta["tags"]).split(",") if meta["tags"] else [],
            success_rate=0.0,
        )

    def list_all_attacks(self) -> List[AttackArtifact]:
        # Warning: Scan operation
        results = self.collection.get()
        artifacts: List[AttackArtifact] = []
        if not results["ids"]:
            return artifacts

        for i, _id in enumerate(results["ids"]):
            try:
                meta = results["metadatas"][i]  # type: ignore
                doc = results["documents"][i]  # type: ignore
                decoded_prompt = base64.b64decode(doc).decode("utf-8")  # type: ignore

                artifacts.append(
                    AttackArtifact(
                        id=_id,
                        prompt_template=decoded_prompt,
                        attack_type=AttackType(meta["type"]),  # type: ignore
                        technique=Technique(meta["technique"]),  # type: ignore
                        source=str(meta["source"]),
                        target_goal=str(meta["target_goal"]),
                        sophistication=int(meta["sophistication"]),  # type: ignore
                        known_success=bool(meta["known_success"]),  # type: ignore
                        description=str(meta["description"]),
                        tags=str(meta["tags"]).split(",") if meta["tags"] else [],
                        success_rate=0.0,
                    )
                )
            except Exception:
                continue
        return artifacts
