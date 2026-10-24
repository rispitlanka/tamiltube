import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyNiche } from "../src/lib/niches";
import { buildTerms, rankSimilar, tokenize } from "../src/lib/similarity";
import { baselineViews, bestUploadDays, median, outlierScores, titleStyleInsight, type VideoLike } from "../src/lib/stats";
import { isTamilText, scoreChannelTamil, styleMix, titleStyle } from "../src/lib/tamil";
import { looksLikeShort, parseChannelInput, parseDuration } from "../src/lib/youtube/parse";

test("parses every way creators share a channel", () => {
  assert.deepEqual(parseChannelInput("@MadanGowri"), { kind: "handle", value: "MadanGowri" });
  assert.deepEqual(parseChannelInput("https://www.youtube.com/@MadanGowri/videos"), { kind: "handle", value: "MadanGowri" });
  assert.deepEqual(parseChannelInput("youtube.com/@chef_venkatesh"), { kind: "handle", value: "chef_venkatesh" });
  assert.deepEqual(parseChannelInput("https://m.youtube.com/channel/UCY6KjrDBN_tIRFT_QNqQbRQ"), { kind: "id", value: "UCY6KjrDBN_tIRFT_QNqQbRQ" });
  assert.deepEqual(parseChannelInput("UCY6KjrDBN_tIRFT_QNqQbRQ"), { kind: "id", value: "UCY6KjrDBN_tIRFT_QNqQbRQ" });
  assert.deepEqual(parseChannelInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10"), { kind: "video", value: "dQw4w9WgXcQ" });
  assert.deepEqual(parseChannelInput("https://youtu.be/dQw4w9WgXcQ?si=abc"), { kind: "video", value: "dQw4w9WgXcQ" });
  assert.deepEqual(parseChannelInput("https://youtube.com/shorts/dQw4w9WgXcQ"), { kind: "video", value: "dQw4w9WgXcQ" });
  assert.deepEqual(parseChannelInput("https://www.youtube.com/c/VillageCookingChannel"), { kind: "custom", value: "VillageCookingChannel" });
  assert.deepEqual(parseChannelInput("https://www.youtube.com/user/someuser"), { kind: "username", value: "someuser" });
  assert.equal(parseChannelInput("https://google.com/foo"), null);
  assert.equal(parseChannelInput("   "), null);
});

test("durations and Shorts detection", () => {
  assert.equal(parseDuration("PT1H2M3S"), 3723);
  assert.equal(parseDuration("PT45S"), 45);
  assert.equal(parseDuration("P1DT1S"), 86401);
  assert.equal(parseDuration(undefined), 0);
  assert.equal(looksLikeShort(45, "anything"), true);
  assert.equal(looksLikeShort(150, "Quick rasam #shorts"), true);
  assert.equal(looksLikeShort(150, "Full rasam recipe"), false);
  assert.equal(looksLikeShort(900, "#shorts"), false);
});

test("detects Tamil in all three writing styles", () => {
  assert.equal(titleStyle("செட்டிநாடு சிக்கன் குழம்பு செய்வது எப்படி"), "tamil");
  assert.equal(titleStyle("Chettinad Chicken Kuzhambu | Village Samayal"), "tanglish");
  assert.equal(titleStyle("iPhone 17 Review – இது வாங்கலாமா?"), "mixed");
  assert.equal(titleStyle("Top 10 Budget Phones in 2026"), "english");
  assert.equal(isTamilText("Semma mass scene machi"), true);
  assert.equal(isTamilText("Learn React in one hour"), false);
});

test("scores channels as Tamil or not", () => {
  const tamil = scoreChannelTamil({
    titles: ["சிக்கன் பிரியாணி", "Village Samayal - mutton kuzhambu", "Rasam recipe in Tamil", "Easy breakfast"],
    description: "Tamil cooking channel",
  });
  assert.ok(tamil >= 0.3, `expected Tamil, got ${tamil}`);
  const english = scoreChannelTamil({ titles: ["Learn Python", "React hooks explained", "Docker in 10 minutes"], description: "Coding tutorials" });
  assert.ok(english < 0.3, `expected not Tamil, got ${english}`);
  const mix = styleMix(["சிக்கன்", "Samayal tips", "Top 5 phones", "Top 6 phones"]);
  assert.equal(mix.english, 0.5);
});

test("classifies niches from titles", () => {
  assert.equal(
    classifyNiche(["Chicken biryani recipe", "மீன் குழம்பு", "Rasam in 10 mins", "Kitchen tour", "Sambar recipe"]),
    "cooking",
  );
  assert.equal(classifyNiche(["iPhone 17 unboxing", "Best budget smartphone", "Samsung S26 camera review", "Laptop buying guide"]), "tech");
  assert.equal(classifyNiche(["random", "thing", "video"]), "general");
});

const d = (daysAgo: number) => new Date(Date.UTC(2026, 9, 24) - daysAgo * 86_400_000);
function vid(id: string, views: number, daysAgo: number, isShort = false, title = id): VideoLike {
  return { id, title, views, publishedAt: d(daysAgo), likes: views / 20, comments: views / 200, durationSec: isShort ? 40 : 600, isShort };
}

test("outlier scores compare against the channel's own normal, per format", () => {
  const now = d(0);
  const vids = [
    vid("a", 10_000, 10), vid("b", 12_000, 14), vid("c", 8_000, 18), vid("d", 11_000, 22), vid("e", 9_000, 26),
    vid("hit", 60_000, 30), // 6× outlier
    vid("s1", 100_000, 9, true), vid("s2", 120_000, 12, true), vid("s3", 80_000, 15, true),
  ];
  assert.equal(median([1, 3, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(baselineViews(vids, false, now), 10_500);
  const scores = outlierScores(vids, now);
  assert.ok(scores.get("hit")! > 5);
  assert.ok(scores.get("a")! < 1.1);
  // Shorts are judged against Shorts, so a 100k Short is normal, not a 10× outlier
  assert.ok(scores.get("s1")! < 1.1);
});

test("best day and title style insights", () => {
  const vids = [vid("a", 10, 1, false, "தமிழ் தலைப்பு ஒன்று"), vid("b", 10, 8, false, "தமிழ் தலைப்பு இரண்டு"), vid("c", 10, 15, false, "தமிழ் மூன்று"),
    vid("x", 10, 2, false, "English title one"), vid("y", 10, 9, false, "English title two"), vid("z", 10, 16, false, "English title three")];
  const scores = new Map([["a", 3], ["b", 4], ["c", 5], ["x", 1], ["y", 0.8], ["z", 1.2]]);
  const styles = titleStyleInsight(vids, scores);
  assert.equal(styles[0].style, "tamil");
  assert.equal(styles[0].medianScore, 4);
  const days = bestUploadDays(vids, scores);
  assert.ok(days.length > 0);
  assert.equal(days[0].medianScore, 4);
});

test("similar channels prefer shared topics and similar size", () => {
  assert.deepEqual(tokenize("Chicken BIRYANI #shorts | சிக்கன் 2026"), ["chicken", "biryani", "சிக்கன்"]);
  const cooking = buildTerms(["chicken biryani recipe", "mutton kuzhambu recipe", "fish fry village cooking"]);
  const target = { id: "t", terms: cooking, subscribers: 20_000, niche: "cooking" };
  const ranked = rankSimilar(target, [
    { id: "same-small", terms: buildTerms(["chicken biryani", "kuzhambu recipe village", "fish curry"]), subscribers: 30_000, niche: "cooking" },
    { id: "same-huge", terms: buildTerms(["chicken biryani", "kuzhambu recipe village", "fish curry"]), subscribers: 20_000_000, niche: "cooking" },
    { id: "tech", terms: buildTerms(["iphone review", "laptop unboxing", "camera test"]), subscribers: 25_000, niche: "tech" },
  ]);
  assert.equal(ranked[0].id, "same-small");
  assert.equal(ranked[1].id, "same-huge");
  assert.ok(!ranked.find((r) => r.id === "tech"));
});
