import "./setup";
import test from "node:test";
import assert from "node:assert/strict";
import { parseLocalStockholm, toLocalInput } from "@/lib/format";
import { isInSweden } from "@/lib/boundary";

test("parseLocalStockholm: natten då sommartid börjar", () => {
  // 29 mars 2026: klockan går från 02:00 till 03:00
  assert.equal(parseLocalStockholm("2026-03-29T01:30").toISOString(), "2026-03-29T00:30:00.000Z");
  assert.equal(parseLocalStockholm("2026-03-29T04:00").toISOString(), "2026-03-29T02:00:00.000Z");
});

test("parseLocalStockholm: natten då vintertid börjar", () => {
  // 25 oktober 2026: klockan går från 03:00 till 02:00
  assert.equal(parseLocalStockholm("2026-10-25T01:00").toISOString(), "2026-10-24T23:00:00.000Z");
  assert.equal(parseLocalStockholm("2026-10-25T04:00").toISOString(), "2026-10-25T03:00:00.000Z");
});

test("parseLocalStockholm: endast datum tolkas som midnatt svensk tid", () => {
  assert.equal(parseLocalStockholm("2026-07-01").toISOString(), "2026-06-30T22:00:00.000Z");
});

test("parseLocalStockholm: ogiltig indata ger ogiltigt datum i stället för undantag", () => {
  for (const s of ["", "hej", "2026-13", "undefined"]) {
    const d = parseLocalStockholm(s);
    assert.ok(isNaN(d.getTime()), `förväntade ogiltigt datum för "${s}"`);
  }
});

test("parseLocalStockholm är invers till toLocalInput", () => {
  for (const iso of ["2026-01-15T11:00:00.000Z", "2026-07-01T10:45:00.000Z", "2026-12-31T23:30:00.000Z", "2026-10-24T23:00:00.000Z"]) {
    assert.equal(parseLocalStockholm(toLocalInput(new Date(iso))).toISOString(), iso);
  }
});

test("isInSweden: svenska orter och grannländer", () => {
  const cases: [string, number, number, boolean][] = [
    ["Stockholm", 59.33, 18.07, true],
    ["Göteborg", 57.71, 11.97, true],
    ["Malmö", 55.6, 13.0, true],
    ["Kiruna", 67.86, 20.23, true],
    ["Visby", 57.64, 18.29, true],
    ["Haparanda", 65.83, 24.1, true],
    ["Umeå", 63.83, 20.26, true],
    ["Holmön", 63.8, 20.9, true],
    ["Skellefteå hamn", 64.68, 21.23, true],
    ["Sandhamn", 59.29, 18.91, true],
    ["Strömstad", 58.94, 11.17, true],
    ["Gotska Sandön", 58.38, 19.2, true],
    ["Oslo", 59.91, 10.75, false],
    ["Köpenhamn", 55.68, 12.57, false],
    ["Helsingfors", 60.17, 24.94, false],
    ["Mariehamn", 60.1, 19.94, false],
    ["Rønne", 55.1, 14.7, false],
    ["Narvik", 68.44, 17.43, false],
    ["Vasa", 63.1, 21.6, false],
    ["Trondheim", 63.43, 10.4, false],
  ];
  for (const [name, lat, lon, expected] of cases) assert.equal(isInSweden(lat, lon), expected, name);
});
