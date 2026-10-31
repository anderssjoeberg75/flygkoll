import "./setup";
import test from "node:test";
import assert from "node:assert/strict";
import { parseNotamCoord } from "@/lib/sources";
import { parseLocalStockholm, toLocalInput } from "@/lib/format";
import { scheduleStatus } from "@/lib/fleet";
import { lowerFt } from "@/lib/briefing";
import { droneRules } from "@/lib/rules";
import { isInSweden } from "@/lib/boundary";

test("parseNotamCoord parses coordinates correctly", () => {
  const coord = parseNotamCoord("5641N01617E");
  assert.ok(coord !== null);
  const [lon, lat] = coord;
  assert.ok(Math.abs(lat - 56.6833) < 0.001);
  assert.ok(Math.abs(lon - 16.2833) < 0.001);

  assert.equal(parseNotamCoord(null), null);
  assert.equal(parseNotamCoord(""), null);
  assert.equal(parseNotamCoord("invalid"), null);
});

test("parseLocalStockholm and toLocalInput handle Stockholm time", () => {
  // Sommartid (UTC+2)
  const dSummer = parseLocalStockholm("2026-06-15T12:00");
  assert.equal(dSummer.toISOString(), "2026-06-15T10:00:00.000Z");
  assert.equal(toLocalInput(dSummer), "2026-06-15T12:00");

  // Vintertid (UTC+1)
  const dWinter = parseLocalStockholm("2026-01-15T12:00");
  assert.equal(dWinter.toISOString(), "2026-01-15T11:00:00.000Z");
  assert.equal(toLocalInput(dWinter), "2026-01-15T12:00");
});

test("scheduleStatus calculates overdue and soon thresholds", () => {
  const now = new Date("2026-05-20T12:00:00Z");

  // Inte förfallen, gott om tid kvar (gjord för 5 dagar sedan, intervall 30)
  const sOk = {
    id: "1",
    drone_id: "d1",
    name: "Service",
    interval_days: 30,
    interval_hours: null,
    last_done_at: "2026-05-15T12:00:00Z",
    last_done_hours: 0,
    active: 1,
  };
  const stOk = scheduleStatus(sOk, 0, now);
  assert.equal(stOk.overdue, false);
  assert.equal(stOk.soon, false);

  // Snart förfallen (20 dagar sedan av 30 dagar -> 10 dagar kvar (< 14 dagar))
  const sSoon = { ...sOk, last_done_at: "2026-04-30T12:00:00Z" };
  const stSoon = scheduleStatus(sSoon, 0, now);
  assert.equal(stSoon.overdue, false);
  assert.equal(stSoon.soon, true);

  // Förfallen (35 dagar sedan)
  const sOverdue = { ...sOk, last_done_at: "2026-04-15T12:00:00Z" };
  const stOverdue = scheduleStatus(sOverdue, 0, now);
  assert.equal(stOverdue.overdue, true);

  // Timintervall förfallet (intervall 10 h, kört 12 h)
  const sHoursOverdue = {
    id: "2",
    drone_id: "d1",
    name: "Timservice",
    interval_days: null,
    interval_hours: 10,
    last_done_at: null,
    last_done_hours: 0,
    active: 1,
  };
  const stHours = scheduleStatus(sHoursOverdue, 12, now);
  assert.equal(stHours.overdue, true);
});

test("lowerFt parses altitude strings from LFV", () => {
  assert.equal(lowerFt("GND"), 0);
  assert.equal(lowerFt("SFC"), 0);
  assert.equal(lowerFt("FL95"), 9500);
  assert.equal(lowerFt("FL120"), 12000);
  assert.equal(lowerFt("1500"), 1500);
  assert.equal(lowerFt(""), 0);
  assert.equal(lowerFt(null), 0);
});

test("droneRules categorizes classes and MTOM correctly", () => {
  assert.equal(droneRules(null).subcategory, "Okänd");

  // C0 / under 250g
  const dC0 = { name: "Mini", model: "DJI Mini", mtom_g: 249, class_mark: "C0" };
  assert.equal(droneRules(dC0).subcategory, "A1");

  // C1
  const dC1 = { name: "Air", model: "DJI Air", mtom_g: 720, class_mark: "C1" };
  assert.equal(droneRules(dC1).subcategory, "A1");

  // C2
  const dC2 = { name: "Mavic", model: "DJI Mavic", mtom_g: 1050, class_mark: "C2" };
  assert.ok(droneRules(dC2).subcategory.includes("A2"));

  // Oklassad > 250 g
  const dLegacy = { name: "Phantom", model: "Phantom 4", mtom_g: 1380, class_mark: "none" };
  assert.equal(droneRules(dLegacy).subcategory, "A3");

  // STS
  const dSTS = { name: "M300", model: "Matrice 300", mtom_g: 7000, class_mark: "C5" };
  assert.ok(droneRules(dSTS).subcategory.includes("Specifik"));
});

test("isInSweden validates coordinates against Swedish boundaries", () => {
  // Sverige
  assert.equal(isInSweden(59.33, 18.06), true); // Stockholm
  assert.equal(isInSweden(57.70, 11.97), true); // Göteborg
  assert.equal(isInSweden(55.60, 13.00), true); // Malmö
  assert.equal(isInSweden(57.63, 18.30), true); // Visby (Gotland)
  assert.equal(isInSweden(56.66, 16.36), true); // Kalmar
  assert.equal(isInSweden(67.85, 20.22), true); // Kiruna

  // Utanför Sverige
  assert.equal(isInSweden(55.67, 12.56), false); // Köpenhamn
  assert.equal(isInSweden(59.91, 10.75), false); // Oslo
  assert.equal(isInSweden(60.17, 24.94), false); // Helsingfors
  assert.equal(isInSweden(48.85, 2.35), false); // Paris
});
