import "./setup";
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { pickClientIp, trustedProxyHops } from "@/lib/net";
import { checkedItems, escapeLike, isUniqueViolation } from "@/lib/validate";
import { assessSources, sourceNotices, type SourceStatus } from "@/lib/briefing";

/* ---------- #31: X-Forwarded-For ---------- */

test("trustedProxyHops: av som standard", () => {
  assert.equal(trustedProxyHops(undefined), 0);
  assert.equal(trustedProxyHops(""), 0);
  assert.equal(trustedProxyHops("0"), 0);
  assert.equal(trustedProxyHops("nej"), 0);
  assert.equal(trustedProxyHops("1"), 1);
  assert.equal(trustedProxyHops("true"), 1);
  assert.equal(trustedProxyHops("2"), 2);
});

test("pickClientIp: utan betrodd proxy ignoreras headers helt", () => {
  assert.equal(pickClientIp("1.2.3.4", "5.6.7.8", 0), null);
});

test("pickClientIp: förfalskad adress till vänster om proxyns används inte", () => {
  // klienten skickar "6.6.6.6", nginx med proxy_add_x_forwarded_for lägger till den riktiga adressen sist
  assert.equal(pickClientIp("6.6.6.6, 203.0.113.9", null, 1), "203.0.113.9");
  // proxy som skriver över headern
  assert.equal(pickClientIp("203.0.113.9", null, 1), "203.0.113.9");
  // två proxies i kedjan
  assert.equal(pickClientIp("6.6.6.6, 203.0.113.9, 10.0.0.2", null, 2), "203.0.113.9");
  assert.equal(pickClientIp(null, " 198.51.100.4 ", 1), "198.51.100.4");
  assert.equal(pickClientIp("2001:DB8::1", null, 1), "2001:db8::1");
});

test("pickClientIp: skräp och tomma värden ger null", () => {
  assert.equal(pickClientIp("", "", 1), null);
  assert.equal(pickClientIp("<script>", null, 1), null);
  assert.equal(pickClientIp("a".repeat(100), null, 1), null);
});

/* ---------- #34: fallerade källor ---------- */

const src = (key: string, group: SourceStatus["group"], ok: boolean): SourceStatus => ({ key, label: key.toUpperCase(), group, ok });
const allOk = [src("rsta", "LFV", true), src("uas", "LFV", true), src("smhi", "Övrigt", true), src("warnings", "Övrigt", true), src("nr", "Övrigt", true), src("n2k", "Övrigt", true), src("kp", "Övrigt", true)];
const failing = (key: string) => allOk.map((s) => (s.key === key ? { ...s, ok: false, error: "Timeout" } : s));

test("assessSources: allt OK ger inga notiser", () => {
  assert.deepEqual(assessSources(allOk), { critical: [], minor: [] });
  assert.deepEqual(sourceNotices(allOk), []);
});

test("assessSources: LFV, naturskydd och SMHI-prognos är kritiska", () => {
  for (const key of ["rsta", "uas", "nr", "n2k", "smhi"]) {
    const a = assessSources(failing(key));
    assert.deepEqual(a.critical.map((s) => s.key), [key], key);
    assert.equal(a.minor.length, 0, key);
    const n = sourceNotices(failing(key));
    assert.equal(n[0].level, "danger", key);
    assert.match(n[0].text, new RegExp(key.toUpperCase()));
  }
});

test("assessSources: vädervarningar och Kp ger bara en varning", () => {
  for (const key of ["warnings", "kp"]) {
    const a = assessSources(failing(key));
    assert.equal(a.critical.length, 0, key);
    assert.deepEqual(a.minor.map((s) => s.key), [key], key);
    const n = sourceNotices(failing(key));
    assert.equal(n.length, 1);
    assert.equal(n[0].level, "warn");
  }
});

test("sourceNotices: LFV och naturskydd listas i samma notis", () => {
  const s = failing("rsta").map((x) => (x.key === "n2k" ? { ...x, ok: false } : x));
  const n = sourceNotices(s);
  assert.equal(n.filter((x) => x.level === "danger").length, 1);
  assert.match(n[0].text, /RSTA, N2K/);
  assert.match(n[0].text, /Drönarkartan/);
  assert.match(n[0].text, /Skyddad natur/);
});

/* ---------- #32: checklistkörning ---------- */

test("checkedItems: dubbletter och ogiltiga index räknas inte", () => {
  assert.deepEqual(checkedItems([0, 0, 0], 3), [0]);
  assert.deepEqual(checkedItems([2, 1, 0, 1], 3), [0, 1, 2]);
  assert.deepEqual(checkedItems([-1, 3, 1.5, "1", null, 99], 3), []);
  assert.deepEqual(checkedItems("0,1,2", 3), []);
  assert.deepEqual(checkedItems([0, 1], 0), []);
});

/* ---------- #37: LIKE och UNIQUE ---------- */

test("escapeLike: % och _ matchas bokstavligt", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE t (name TEXT); INSERT INTO t VALUES ('100% säkert'), ('Bromma'), ('a_b'), ('axb')");
  const find = (q: string) => (db.prepare("SELECT name FROM t WHERE name LIKE ? ESCAPE '\\' ORDER BY name").all(`%${escapeLike(q)}%`) as { name: string }[]).map((r) => r.name);
  assert.deepEqual(find("%"), ["100% säkert"]);
  assert.deepEqual(find("_"), ["a_b"]);
  assert.deepEqual(find("brom"), ["Bromma"]);
  assert.deepEqual(find("\\"), []);
  db.close();
});

test("isUniqueViolation känner igen SQLite-konflikten", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE u (email TEXT UNIQUE)");
  db.prepare("INSERT INTO u VALUES (?)").run("a@b.se");
  let err: unknown;
  try {
    db.prepare("INSERT INTO u VALUES (?)").run("a@b.se");
  } catch (e) {
    err = e;
  }
  assert.ok(isUniqueViolation(err));
  assert.equal(isUniqueViolation(new Error("annat")), false);
  assert.equal(isUniqueViolation(null), false);
  db.close();
});
