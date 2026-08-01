import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { StarRating } from "@/components/ui/StarRating";

describe("StarRating", () => {
  it("en modo lectura no ofrece botones", () => {
    render(<StarRating value={3} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("anuncia la puntuación a lectores de pantalla", () => {
    render(<StarRating value={3.5} />);

    expect(screen.getByLabelText("3.5 de 5 estrellas")).toBeInTheDocument();
  });

  it("en modo edición ofrece una estrella por puntuación", () => {
    render(<StarRating value={0} onChange={vi.fn()} />);

    expect(screen.getAllByRole("button")).toHaveLength(5);
  });

  it("avisa de la puntuación elegida al pulsar una estrella", async () => {
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: /4 estrellas/i }));

    expect(onChange).toHaveBeenCalledWith(4);
  });
});
