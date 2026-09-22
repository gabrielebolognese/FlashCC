import { describe, expect, it } from "vitest";

import {
  ALL_CLIENTS,
  assignTo,
  belongsTo,
  canAddClient,
  CLIENT_COLOURS,
  clientById,
  clientLimit,
  colourFor,
  countsByClient,
  forClient,
  labelFor,
  makeClient,
  UNASSIGNED,
  activeClients,
  type Client,
  type Owned,
} from "./clients.js";

const owned = (clientId?: string): Owned => (clientId ? { clientId } : {});

const acme = makeClient("Acme", 0);
const beta = makeClient("Beta", 1);
const clients: Client[] = [acme, beta];

const library: Owned[] = [owned(acme.id), owned(acme.id), owned(beta.id), owned(), owned()];

describe("tiers", () => {
  /** The same ladder brands use, because a second shape is a second explanation. */
  it("is the ladder the market proved", () => {
    expect(clientLimit("free")).toBe(1);
    expect(clientLimit("pro")).toBe(5);
    expect(clientLimit("agency")).toBe(Infinity);
  });

  it("treats an unknown plan as free", () => {
    expect(clientLimit(undefined)).toBe(1);
  });

  it("refuses one past the allowance and allows one under it", () => {
    expect(canAddClient(0, "free")).toBe(true);
    expect(canAddClient(1, "free")).toBe(false);
    expect(canAddClient(400, "agency")).toBe(true);
  });
});

describe("making one", () => {
  it("names it and gives it a colour from the palette", () => {
    expect(acme.name).toBe("Acme");
    expect(CLIENT_COLOURS).toContain(acme.colour);
  });

  it("falls back to a name rather than an empty label", () => {
    expect(makeClient("   ").name).toBe("Untitled client");
  });

  it("cycles colours rather than running out", () => {
    expect(colourFor(CLIENT_COLOURS.length)).toBe(CLIENT_COLOURS[0]);
    expect(colourFor(999)).toBeTruthy();
  });

  it("gives two clients different colours", () => {
    expect(acme.colour).not.toBe(beta.colour);
  });
});

/**
 * The evidence demands both at once: "I can separate each one so that nothing
 * gets mixed" alongside "it was a downside to have to toggle back and forth
 * between clients instead of seeing everything under one view."
 */
describe("filtering", () => {
  it("shows everything under the roll-up, unassigned work included", () => {
    expect(forClient(library, ALL_CLIENTS)).toHaveLength(5);
  });

  it("shows one client's work alone", () => {
    expect(forClient(library, acme.id)).toHaveLength(2);
  });

  /** A real bucket. Most of anybody's library starts here. */
  it("has a bucket for work that belongs to nobody", () => {
    expect(forClient(library, UNASSIGNED)).toHaveLength(2);
  });

  it("does not put unassigned work under a named client", () => {
    expect(belongsTo(owned(), acme.id)).toBe(false);
  });

  it("counts each client and the unassigned pile", () => {
    const counts = countsByClient(library);
    expect(counts.get(acme.id)).toBe(2);
    expect(counts.get(beta.id)).toBe(1);
    expect(counts.get(UNASSIGNED)).toBe(2);
  });

  it("returns nothing for a client that does not exist rather than everything", () => {
    expect(forClient(library, "cl_gone")).toHaveLength(0);
  });
});

describe("labels", () => {
  it("names the roll-up and the unassigned bucket the same way everywhere", () => {
    expect(labelFor(clients, ALL_CLIENTS)).toBe("All clients");
    expect(labelFor(clients, UNASSIGNED)).toBe("Unassigned");
  });

  it("names a client", () => {
    expect(labelFor(clients, acme.id)).toBe("Acme");
  });

  /** A deleted client leaves a stale selection; falling back to the roll-up is the safe read. */
  it("falls back to the roll-up when the selection is gone", () => {
    expect(labelFor(clients, "cl_gone")).toBe("All clients");
  });
});

describe("assigning", () => {
  it("moves a record to a client", () => {
    expect(assignTo(owned(), acme.id).clientId).toBe(acme.id);
  });

  it("unassigns without deleting the key, which exactOptionalPropertyTypes needs", () => {
    const moved = assignTo(owned(acme.id), undefined);
    expect(moved.clientId).toBeUndefined();
    expect("clientId" in moved).toBe(true);
  });

  it("does not mutate what it was given", () => {
    const before = owned(acme.id);
    assignTo(before, beta.id);
    expect(before.clientId).toBe(acme.id);
  });
});

describe("archiving", () => {
  it("leaves archived clients out of the live list", () => {
    expect(activeClients([acme, { ...beta, archived: true }])).toHaveLength(1);
  });

  it("still finds an archived client by id, so its work keeps its label", () => {
    expect(clientById([{ ...beta, archived: true }], beta.id)?.name).toBe("Beta");
  });

  it("finds nothing for an absent id", () => {
    expect(clientById(clients, undefined)).toBeUndefined();
  });
});
