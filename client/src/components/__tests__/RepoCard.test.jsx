/**
 * @file src/components/__tests__/RepoCard.test.jsx
 * @description Unit tests for the RepoCard component.
 *
 * Verifies:
 *  - Renders repo name, description, language, and visibility badge.
 *  - "Deploy with AI" button fires `onDeploy` callback with the repo object.
 *  - Button is disabled and shows "Deploying…" when `deploying` prop is true.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import RepoCard from "../RepoCard";

const mockRepo = {
  name: "my-cool-app",
  full_name: "testUser/my-cool-app",
  description: "A super cool application",
  language: "JavaScript",
  private: false,
  html_url: "https://github.com/testUser/my-cool-app",
  updated_at: "2026-03-01T00:00:00Z",
};

describe("RepoCard", () => {
  it("renders the repository name", () => {
    render(<RepoCard repo={mockRepo} onDeploy={() => {}} />);
    expect(screen.getByText("my-cool-app")).toBeInTheDocument();
  });

  it("renders the repository description", () => {
    render(<RepoCard repo={mockRepo} onDeploy={() => {}} />);
    expect(screen.getByText("A super cool application")).toBeInTheDocument();
  });

  it("renders the primary language", () => {
    render(<RepoCard repo={mockRepo} onDeploy={() => {}} />);
    expect(screen.getByText("JavaScript")).toBeInTheDocument();
  });

  it("shows 'Public' badge for public repos", () => {
    render(<RepoCard repo={mockRepo} onDeploy={() => {}} />);
    expect(screen.getByText("Public")).toBeInTheDocument();
  });

  it("shows 'Private' badge for private repos", () => {
    const privateRepo = { ...mockRepo, private: true };
    render(<RepoCard repo={privateRepo} onDeploy={() => {}} />);
    expect(screen.getByText("Private")).toBeInTheDocument();
  });

  it("fires onDeploy with the repo object when deploy button is clicked", async () => {
    const onDeploy = vi.fn();
    const user = userEvent.setup();

    render(<RepoCard repo={mockRepo} onDeploy={onDeploy} />);

    const btn = screen.getByRole("button", { name: /deploy with ai/i });
    await user.click(btn);

    expect(onDeploy).toHaveBeenCalledTimes(1);
    expect(onDeploy).toHaveBeenCalledWith(mockRepo);
  });

  it("disables the button and shows 'Deploying…' when deploying prop is true", () => {
    render(<RepoCard repo={mockRepo} onDeploy={() => {}} deploying={true} />);

    const btn = screen.getByRole("button", { name: /deploying/i });
    expect(btn).toBeDisabled();
  });

  it("shows fallback text when no description is provided", () => {
    const noDescRepo = { ...mockRepo, description: null };
    render(<RepoCard repo={noDescRepo} onDeploy={() => {}} />);
    expect(screen.getByText("No description provided.")).toBeInTheDocument();
  });

  it("renders a GitHub link pointing to the repo URL", () => {
    render(<RepoCard repo={mockRepo} onDeploy={() => {}} />);
    const link = screen.getByTitle("View on GitHub");
    expect(link).toHaveAttribute("href", mockRepo.html_url);
    expect(link).toHaveAttribute("target", "_blank");
  });
});
