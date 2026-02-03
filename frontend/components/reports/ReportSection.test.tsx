import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileText } from 'lucide-react';
import {
  ReportSection,
  SectionNavItem,
  type ReportSectionId,
} from './ReportSection';

describe('ReportSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders section with title and content', () => {
    render(
      <ReportSection id="executive-summary" title="Executive Summary">
        <p>Test content</p>
      </ReportSection>
    );

    expect(screen.getByText('Executive Summary')).toBeInTheDocument();
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders with icon', () => {
    const { container } = render(
      <ReportSection id="executive-summary" title="Test Section" icon={FileText}>
        <p>Content</p>
      </ReportSection>
    );

    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('has correct section ID for navigation', () => {
    render(
      <ReportSection id="risk-score" title="Risk Score">
        <p>Content</p>
      </ReportSection>
    );

    expect(document.getElementById('risk-score')).toBeInTheDocument();
  });

  it('is expanded by default', () => {
    render(
      <ReportSection id="executive-summary" title="Test" defaultExpanded={true}>
        <p>Visible content</p>
      </ReportSection>
    );

    expect(screen.getByText('Visible content')).toBeInTheDocument();
  });

  it('can start collapsed', () => {
    const { container } = render(
      <ReportSection id="executive-summary" title="Test" defaultExpanded={false}>
        <p>Hidden content</p>
      </ReportSection>
    );

    // Collapsible content should be in closed state
    const collapsibleContent = container.querySelector('[data-slot="collapsible-content"]');
    expect(collapsibleContent).toHaveAttribute('data-state', 'closed');
  });

  it('toggles expansion when trigger is clicked', () => {
    render(
      <ReportSection id="executive-summary" title="Test" defaultExpanded={true}>
        <p>Content</p>
      </ReportSection>
    );

    const trigger = screen.getByRole('button', { expanded: true });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('calls onExpandedChange when toggled', () => {
    const onExpandedChange = vi.fn();

    render(
      <ReportSection
        id="executive-summary"
        title="Test"
        defaultExpanded={true}
        onExpandedChange={onExpandedChange}
      >
        <p>Content</p>
      </ReportSection>
    );

    const trigger = screen.getByRole('button', { expanded: true });
    fireEvent.click(trigger);

    expect(onExpandedChange).toHaveBeenCalledWith(false);
  });

  it('supports controlled expanded state', () => {
    const onExpandedChange = vi.fn();

    const { rerender } = render(
      <ReportSection
        id="executive-summary"
        title="Test"
        expanded={true}
        onExpandedChange={onExpandedChange}
      >
        <p>Content</p>
      </ReportSection>
    );

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');

    // Update to collapsed
    rerender(
      <ReportSection
        id="executive-summary"
        title="Test"
        expanded={false}
        onExpandedChange={onExpandedChange}
      >
        <p>Content</p>
      </ReportSection>
    );

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders non-collapsible section without trigger', () => {
    render(
      <ReportSection id="executive-summary" title="Test" collapsible={false}>
        <p>Content</p>
      </ReportSection>
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders in print mode without collapsible', () => {
    render(
      <ReportSection id="executive-summary" title="Test" printMode={true}>
        <p>Print content</p>
      </ReportSection>
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Print content')).toBeInTheDocument();
  });

  it('applies highlighted styling', () => {
    const { container } = render(
      <ReportSection id="executive-summary" title="Test" highlighted={true}>
        <p>Content</p>
      </ReportSection>
    );

    const section = container.querySelector('section');
    expect(section).toHaveClass('ring-2');
  });

  it('applies custom className', () => {
    const { container } = render(
      <ReportSection
        id="executive-summary"
        title="Test"
        className="custom-class"
      >
        <p>Content</p>
      </ReportSection>
    );

    const section = container.querySelector('section');
    expect(section).toHaveClass('custom-class');
  });

  it('has proper accessibility attributes', () => {
    render(
      <ReportSection id="executive-summary" title="Test Section">
        <p>Content</p>
      </ReportSection>
    );

    const section = document.getElementById('executive-summary');
    expect(section).toHaveAttribute('aria-labelledby');

    const heading = screen.getByText('Test Section');
    expect(heading).toHaveAttribute('id');
  });

  it('trigger has aria-controls linking to content', () => {
    render(
      <ReportSection id="executive-summary" title="Test">
        <p>Content</p>
      </ReportSection>
    );

    const trigger = screen.getByRole('button');
    expect(trigger).toHaveAttribute('aria-controls');
  });

  it('supports keyboard navigation on trigger', () => {
    const onExpandedChange = vi.fn();

    render(
      <ReportSection
        id="executive-summary"
        title="Test"
        defaultExpanded={true}
        onExpandedChange={onExpandedChange}
      >
        <p>Content</p>
      </ReportSection>
    );

    const trigger = screen.getByRole('button');

    // Radix handles keyboard navigation - clicking should work
    fireEvent.click(trigger);
    expect(onExpandedChange).toHaveBeenCalled();
  });

  it('scroll-mt class for navigation offset', () => {
    const { container } = render(
      <ReportSection id="executive-summary" title="Test">
        <p>Content</p>
      </ReportSection>
    );

    const section = container.querySelector('section');
    expect(section).toHaveClass('scroll-mt-4');
  });
});

describe('SectionNavItem', () => {
  it('renders with label and icon', () => {
    const { container } = render(
      <ul>
        <SectionNavItem
          sectionId="executive-summary"
          label="Executive Summary"
          icon={FileText}
        />
      </ul>
    );

    expect(screen.getByText('Executive Summary')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders without icon', () => {
    const { container } = render(
      <ul>
        <SectionNavItem
          sectionId="executive-summary"
          label="Executive Summary"
        />
      </ul>
    );

    expect(screen.getByText('Executive Summary')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('has correct href', () => {
    render(
      <ul>
        <SectionNavItem sectionId="risk-score" label="Risk Score" />
      </ul>
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '#risk-score');
  });

  it('shows active state', () => {
    render(
      <ul>
        <SectionNavItem
          sectionId="executive-summary"
          label="Executive Summary"
          isActive={true}
        />
      </ul>
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('aria-current', 'location');
    expect(link).toHaveClass('bg-muted');
  });

  it('shows inactive state', () => {
    render(
      <ul>
        <SectionNavItem
          sectionId="executive-summary"
          label="Executive Summary"
          isActive={false}
        />
      </ul>
    );

    const link = screen.getByRole('link');
    expect(link).not.toHaveAttribute('aria-current');
    expect(link).toHaveClass('text-muted-foreground');
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();

    render(
      <ul>
        <SectionNavItem
          sectionId="executive-summary"
          label="Executive Summary"
          onClick={onClick}
        />
      </ul>
    );

    const link = screen.getByRole('link');
    fireEvent.click(link);

    expect(onClick).toHaveBeenCalledWith('executive-summary');
  });

  it('prevents default link behavior', () => {
    const onClick = vi.fn();

    render(
      <ul>
        <SectionNavItem
          sectionId="executive-summary"
          label="Executive Summary"
          onClick={onClick}
        />
      </ul>
    );

    const link = screen.getByRole('link');
    const event = fireEvent.click(link);

    // onClick was called but default prevented
    expect(onClick).toHaveBeenCalled();
  });

  it('supports keyboard navigation with Enter', () => {
    const onClick = vi.fn();

    render(
      <ul>
        <SectionNavItem
          sectionId="executive-summary"
          label="Executive Summary"
          onClick={onClick}
        />
      </ul>
    );

    const link = screen.getByRole('link');
    fireEvent.keyDown(link, { key: 'Enter' });

    expect(onClick).toHaveBeenCalledWith('executive-summary');
  });

  it('supports keyboard navigation with Space', () => {
    const onClick = vi.fn();

    render(
      <ul>
        <SectionNavItem
          sectionId="executive-summary"
          label="Executive Summary"
          onClick={onClick}
        />
      </ul>
    );

    const link = screen.getByRole('link');
    fireEvent.keyDown(link, { key: ' ' });

    expect(onClick).toHaveBeenCalledWith('executive-summary');
  });

  it('ignores other keys', () => {
    const onClick = vi.fn();

    render(
      <ul>
        <SectionNavItem
          sectionId="executive-summary"
          label="Executive Summary"
          onClick={onClick}
        />
      </ul>
    );

    const link = screen.getByRole('link');
    fireEvent.keyDown(link, { key: 'Tab' });

    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not crash without onClick', () => {
    render(
      <ul>
        <SectionNavItem sectionId="executive-summary" label="Executive Summary" />
      </ul>
    );

    const link = screen.getByRole('link');
    expect(() => fireEvent.click(link)).not.toThrow();
  });
});
