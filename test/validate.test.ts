import "./setup";
import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, isEmail, oneOf, optNumber, parseCsv, passwordProblem, safeJson, CLASS_MARKS } from "@/lib/validate";

test("parseCsv: citerade fält med separator, citattecken och radbrytning", () => {
  const rows = parseCsv('datum;plats;anteckning\n2026-05-01 14:30;"Hagaparken; norra";"sa ""hej""\nrad två"\n\n2026-05-02;Bromma;ok\n');
  assert.deepEqual(rows, [
    ["datum", "plats", "anteckning"],
    ["2026-05-01 14:30", "Hagaparken; norra", 'sa "hej"\nrad två'],
    ["2026-05-02", "Bromma", "ok"],
  ]);
});

test("parseCsv: kommaseparerat, BOM och CRLF", () => {
  assert.deepEqual(parseCsv("﻿a,b\r\n1,\"2,5\"\r\n"), [["a", "b"], ["1", "2,5"]]);
});

test("parseCsv: maxRows begränsar", () => {
  assert.equal(parseCsv("h\n1\n2\n3\n4", 2).length, 2);
});

test("csvCell skyddar mot formelinjektion men inte tal", () => {
  assert.equal(csvCell("=HYPERLINK(\"x\")"), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell("+46 70"), `"'+46 70"`);
  assert.equal(csvCell("-test"), `"'-test"`);
  assert.equal(csvCell("@SUM"), `"'@SUM"`);
  assert.equal(csvCell(-5.5), `"-5.5"`);
  assert.equal(csvCell(null), `""`);
  assert.equal(csvCell("vanlig text"), `"vanlig text"`);
});

test("isEmail", () => {
  assert.ok(isEmail("anna@example.se"));
  assert.ok(!isEmail("anna@"));
  assert.ok(!isEmail("@example.se"));
  assert.ok(!isEmail("anna@example"));
  assert.ok(!isEmail("an na@example.se"));
});

test("passwordProblem", () => {
  assert.match(passwordProblem("kort")!, /minst 10/);
  assert.match(passwordProblem("password123")!, /vanligt/);
  assert.match(passwordProblem("aaaaaaaaaaaa")!, /vanligt/);
  assert.match(passwordProblem("anna.svensson-2026", "anna.svensson@example.se")!, /e-post/);
  assert.equal(passwordProblem("blå-propeller-fyra", "anna@example.se"), null);
});

test("safeJson ger reservvärde vid trasig data", () => {
  assert.deepEqual(safeJson('["a"]', []), ["a"]);
  assert.deepEqual(safeJson("{trasig", []), []);
  assert.equal(safeJson(null, null), null);
});

test("oneOf och optNumber", () => {
  assert.equal(oneOf("C2", CLASS_MARKS, "none"), "C2");
  assert.equal(oneOf("<script>", CLASS_MARKS, "none"), "none");
  assert.equal(optNumber("12,5", 0, 100), 12.5);
  assert.equal(optNumber("abc"), null);
  assert.equal(optNumber("500", 0, 100), null);
  assert.equal(optNumber(""), null);
});
