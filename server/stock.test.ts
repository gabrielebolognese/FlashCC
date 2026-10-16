import { describe, expect, it } from "vitest";

import { isDownloadLocation, normalisePexels, normaliseUnsplash, searchRequest, withReferral } from "./stock.js";

// Trimmed from real responses: the fields this file reads, as the APIs name them.
const UNSPLASH = {
  total: 2,
  total_pages: 3,
  results: [
    {
      id: "abc123",
      width: 4000,
      height: 6000,
      color: "#26402d",
      alt_description: "a wooden desk with a laptop",
      urls: {
        raw: "https://images.unsplash.com/photo-1?ixid=XYZ",
        regular: "https://images.unsplash.com/photo-1?ixid=XYZ&w=1080",
        small: "https://images.unsplash.com/photo-1?ixid=XYZ&w=400",
        thumb: "https://images.unsplash.com/photo-1?ixid=XYZ&w=200",
      },
      links: {
        html: "https://unsplash.com/photos/abc123",
        download_location: "https://api.unsplash.com/photos/abc123/download?ixid=XYZ",
      },
      user: { name: "Ana Lee", username: "analee", links: { html: "https://unsplash.com/@analee" } },
    },
    { id: "broken", urls: {}, user: {} },
  ],
};

const PEXELS = {
  page: 1,
  per_page: 24,
  next_page: "https://api.pexels.com/v1/search/?page=2&per_page=24&query=desk",
  photos: [
    {
      id: 2004161,
      width: 3000,
      height: 2000,
      url: "https://www.pexels.com/photo/desk-2004161/",
      photographer: "Sam Ortiz",
      photographer_url: "https://www.pexels.com/@sam",
      avg_color: "#978E82",
      alt: "Desk by a window",
      src: {
        original: "https://images.pexels.com/photos/2004161/pexels-photo-2004161.jpeg",
        medium: "https://images.pexels.com/photos/2004161/pexels-photo-2004161.jpeg?h=350",
      },
    },
  ],
};

describe("normaliseUnsplash", () => {
  const r = normaliseUnsplash(UNSPLASH, 1);

  it("keeps complete results and drops broken ones", () => {
    expect(r.photos).toHaveLength(1);
    expect(r.more).toBe(true);
  });

  it("hotlinks the provider's URL, sized for a 2x export", () => {
    const p = r.photos[0]!;
    expect(p.src.startsWith("https://images.unsplash.com/photo-1?ixid=XYZ&")).toBe(true);
    expect(p.src).toContain("w=2160");
    expect(p.thumb).toContain("images.unsplash.com");
  });

  it("credits the photographer and Unsplash, both with the referral tag", () => {
    const c = r.photos[0]!.credit;
    expect(c.name).toBe("Ana Lee");
    expect(c.url).toBe("https://unsplash.com/@analee?utm_source=flashcc&utm_medium=referral");
    expect(c.page).toBe("https://unsplash.com/photos/abc123?utm_source=flashcc&utm_medium=referral");
    expect(r.photos[0]!.downloadLocation).toBe(UNSPLASH.results[0]!.links!.download_location);
  });

  it("knows the last page", () => {
    expect(normaliseUnsplash(UNSPLASH, 3).more).toBe(false);
    expect(normaliseUnsplash({}, 1).photos).toEqual([]);
  });
});

describe("normalisePexels", () => {
  const r = normalisePexels(PEXELS, 1);

  it("normalises to the same shape, with no download ping", () => {
    const p = r.photos[0]!;
    expect(p).toMatchObject({ id: "pexels:2004161", provider: "pexels", w: 3000, h: 2000, alt: "Desk by a window" });
    expect(p.src).toContain("images.pexels.com");
    expect(p.downloadLocation).toBeUndefined();
    expect(p.credit).toEqual({
      provider: "pexels",
      name: "Sam Ortiz",
      url: "https://www.pexels.com/@sam",
      page: "https://www.pexels.com/photo/desk-2004161/",
    });
    expect(r.more).toBe(true);
  });
});

describe("searchRequest", () => {
  it("authenticates each provider its own way and encodes the query", () => {
    const u = searchRequest("unsplash", "home office", 2, "KEY");
    expect(u.url).toContain("api.unsplash.com/search/photos?query=home%20office&page=2");
    expect(u.headers.Authorization).toBe("Client-ID KEY");
    const p = searchRequest("pexels", "desk", 1, "KEY");
    expect(p.url).toContain("api.pexels.com/v1/search?query=desk");
    expect(p.headers.Authorization).toBe("KEY");
  });
});

describe("isDownloadLocation", () => {
  it("only lets through Unsplash's own download endpoint", () => {
    expect(isDownloadLocation("https://api.unsplash.com/photos/abc123/download?ixid=XYZ")).toBe(true);
    expect(isDownloadLocation("https://evil.example/photos/abc/download")).toBe(false);
    expect(isDownloadLocation("https://api.unsplash.com.evil.example/photos/a/download")).toBe(false);
    expect(isDownloadLocation("http://api.unsplash.com/photos/a/download")).toBe(false);
    expect(isDownloadLocation(42)).toBe(false);
  });
});

describe("withReferral", () => {
  it("appends to an existing query or starts one", () => {
    expect(withReferral("https://unsplash.com/@a")).toBe("https://unsplash.com/@a?utm_source=flashcc&utm_medium=referral");
    expect(withReferral("https://x?y=1")).toBe("https://x?y=1&utm_source=flashcc&utm_medium=referral");
  });
});
