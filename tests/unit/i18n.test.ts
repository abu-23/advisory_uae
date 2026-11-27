import { describe, expect, it } from "vitest";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import { parseAnswers, parseServices } from "@/lib/filters";
import { rankResults } from "@/server/domain/ranking";

const keys = (o: object, p = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`]));

describe("translations", () => {
  it("every English text has an Arabic one, and the reverse", () => {
    expect(keys(ar).sort()).toEqual(keys(en).sort());
  });

  it("no empty strings", () => {
    const values = (o: object): string[] => Object.values(o).flatMap((v) => (typeof v === "object" ? values(v) : [v]));
    expect(values(en).filter((v) => !v.trim())).toEqual([]);
    expect(values(ar).filter((v) => !v.trim())).toEqual([]);
  });
});

describe("answers from the URL", () => {
  it("keeps only known services, in a fixed order", () => {
    expect(parseServices({ s: ["VISA", "HACK", "TRADE_LICENSE", "VISA"] })).toEqual(["TRADE_LICENSE", "VISA"]);
  });

  it("rejects bad values instead of guessing", () => {
    expect(parseAnswers({ s: "VISA", loc: "MARS", visas: "2", time: "WEEK" })).toBeNull();
    expect(parseAnswers({ s: "VISA", loc: "ABU_DHABI", visas: "999", time: "WEEK" })).toBeNull();
    expect(parseAnswers({ loc: "ABU_DHABI", time: "WEEK" })).toBeNull();
  });

  it("ignores the visa count when visas weren't picked", () => {
    expect(parseAnswers({ s: "EJARI", loc: "DUBAI_MAINLAND", visas: "999", time: "FLEXIBLE" })?.visas).toBe(0);
  });
});

describe("results order", () => {
  it("verified first, then lowest price, never paid placement", () => {
    const ranked = rankResults([
      { companyName: "Cheap unverified", verified: false, year1Fils: 100 },
      { companyName: "Pricey verified", verified: true, year1Fils: 900 },
      { companyName: "Cheaper verified", verified: true, year1Fils: 500 },
    ]);
    expect(ranked.map((r) => r.companyName)).toEqual(["Cheaper verified", "Pricey verified", "Cheap unverified"]);
  });
});
