import { ChangeEvent, useEffect, useMemo, useState } from "react";

type Json = Record<string, unknown>;
type Side = "blue" | "red" | "unknown";
type Route = "upload" | "summary" | "timeline" | "objectives" | "jungle" | "players" | "history";

type Player = {
  player_id: string;
  player: string;
  tag?: string | null;
  champion: string;
  champion_key?: string | null;
  champion_id?: number | null;
  side?: Side | string;
  team?: number;
  role?: string;
  result?: string;
  level?: number;
  kda: { kills?: number; deaths?: number; assists?: number };
  gold?: number;
  cs?: number;
  jungle_cs?: number;
  jungle?: { enemy_jungle_cs?: number; own_jungle_cs?: number };
  stats?: Record<string, number | null>;
  objectives?: { dragons?: number; heralds?: number; barons?: number };
  derived?: Record<string, number | null>;
  impact?: { dimensions?: Json; evidence?: unknown[] };
};

type Team = {
  team: number;
  side?: Side | string;
  result?: string;
  kills?: number;
  deaths?: number;
  assists?: number;
  gold?: number;
  champion_damage?: number;
  time_dead_seconds?: number;
  avg_level?: number;
  [key: string]: unknown;
};

type Artifact = { status?: string; reason?: string; warning?: string; events?: unknown[]; segments?: unknown[]; [key: string]: unknown };
type Capability = { status?: string; reason?: string; warning?: string; profile_client_version?: string; target_client_version?: string; [key: string]: unknown };
type TimelineEvent = Json;
type Report = {
  match_id: string;
  game: { patch?: string; duration_seconds?: number | null; format_version?: string };
  source?: { file_name?: string; sha256?: string };
  created_at?: string;
  teams: Team[];
  players: Player[];
  transport: Json;
  timeline?: Artifact;
  objectives?: Artifact;
  movement: Artifact;
  capabilities?: Record<string, Capability>;
  analysis?: { facts?: Json[]; inferences?: unknown[]; unknowns?: string[]; method?: string };
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";
const nav: Array<{ id: Route; index: string; label: string; section: string }> = [
  { id: "upload", index: "01", label: "Upload replay", section: "REPLAY" },
  { id: "summary", index: "02", label: "Match summary", section: "REPLAY" },
  { id: "timeline", index: "03", label: "Timeline", section: "ANALYSIS" },
  { id: "objectives", index: "04", label: "Objective windows", section: "ANALYSIS" },
  { id: "jungle", index: "05", label: "Jungle economy", section: "ANALYSIS" },
  { id: "players", index: "06", label: "Player reports", section: "ANALYSIS" },
  { id: "history", index: "08", label: "History", section: "TOOLS" },
];

const championIds: Record<string, number> = {
  ahri: 103,
  aatrox: 266, azir: 268, bard: 432, blitzcrank: 53, braum: 201, caitlyn: 51, camille: 164,
  darius: 122, ekko: 245, ezreal: 81, graves: 104, garen: 86, gnar: 150, jax: 24, jhin: 202,
  jinx: 222, kaisa: 145, "kai'sa": 145, kindred: 203, leesin: 64, leona: 89, lucian: 236,
  nami: 267, nautilus: 111, orianna: 61, rengar: 107, sejuani: 77, sett: 875, sivir: 15,
  thresh: 412, tristana: 18, viego: 234, vi: 254, yasuo: 157, yone: 777, zac: 154,
  akali: 84, ashe: 22, xerath: 101, pyke: 555, malphite: 54, viktor: 112, khazix: 121,
  "kha'zix": 121, karthus: 30, poppy: 78, syndra: 134, varus: 110, smolder: 147,
  talon: 91, renekton: 58, illaoi: 420, zyra: 143, "xin zhao": 5, xinzhao: 5, mel: 902,
  "miss fortune": 21, "twisted fate": 4,
};

function asRecord(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function number(value: unknown, fallback = 0): number { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function label(value: unknown, fallback = "—"): string { return typeof value === "string" && value.trim() ? value : fallback; }
function displayStatus(value: unknown): string { const status = label(value, "unknown"); return status === "candidate" ? "warning" : status; }
function formatNumber(value: unknown): string { return new Intl.NumberFormat("vi-VN").format(number(value)); }
function formatTime(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const seconds = number(value, NaN);
  if (!Number.isFinite(seconds)) return label(value);
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
function percent(value: unknown): string {
  const n = number(value, NaN);
  return Number.isFinite(n) ? `${Math.round((n <= 1 ? n : n / 100) * 100)}%` : "—";
}
function sideOf(value: { side?: string; team?: number } | null | undefined): Side {
  if (value?.side === "blue" || value?.side === "red") return value.side;
  if (value?.team === 100) return "blue";
  if (value?.team === 200) return "red";
  return "unknown";
}
function championImage(name: string, championId?: number | null, patch?: string): string | undefined {
  const normalized = name.trim().toLowerCase();
  const id = championId ?? championIds[normalized] ?? championIds[normalized.replaceAll("'", "")];
  if (!id) return undefined;
  const match = patch?.match(/^(\d+\.\d+)/);
  const version = match ? `${match[1]}.1` : "latest";
  return `https://cdn.communitydragon.org/${version}/champion/${id}/tile`;
}
function metric(team: Team | undefined, key: string): number {
  if (!team) return 0;
  const nested = asRecord(team.objectives);
  return number(team[key], number(nested[key]));
}
function eventTime(event: Json): number { return number(event.timestamp_seconds, number(event.time_seconds, number(event.t, number(event.time, NaN)))); }
function timelineEvents(report: Report): TimelineEvent[] {
  const candidates = [report.timeline?.events, (report as unknown as Json).events];
  const events = candidates.find(Array.isArray) as unknown[] | undefined;
  return (events ?? []).map(asRecord).filter((event) => Number.isFinite(eventTime(event))).sort((a, b) => eventTime(a) - eventTime(b));
}
function eventKind(event: Json): string {
  const raw = `${event.type ?? event.kind ?? event.event_type ?? "event"}`.toLowerCase();
  return raw.includes("objective") || raw.includes("dragon") || raw.includes("baron") || raw.includes("herald") ? "objective" : raw.includes("death") || raw.includes("kill") ? "death" : "event";
}
function eventTitle(event: Json): string {
  if (eventKind(event) === "death") return `${label(event.victim ?? event.victim_player ?? event.player, "Player")} bị hạ bởi ${label(event.killer ?? event.killer_player, "đối phương")}`;
  return label(event.name ?? event.objective ?? event.sub_kind ?? event.kind, "Objective event");
}

function App() {
  const [route, setRoute] = useState<Route>(() => {
    try { const saved = localStorage.getItem("rofl_route") as Route | null; return nav.some((item) => item.id === saved) ? saved! : "summary"; } catch { return "summary"; }
  });
  const [reports, setReports] = useState<Array<{ match_id: string; game?: Report["game"]; created_at?: string }>>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReport(matchId: string) {
    const response = await fetch(`${API_BASE}/reports/${encodeURIComponent(matchId)}`);
    if (!response.ok) throw new Error(`Không tải được report ${matchId}`);
    const data = await response.json() as Report;
    setReport(data); setSelectedPlayer(data.players[0]?.player_id ?? null);
  }
  async function loadReports(preferredMatchId?: string) {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/reports`);
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = await response.json() as { reports: Array<{ match_id: string; game?: Report["game"]; created_at?: string }> };
      const available = data.reports ?? [];
      setReports(available);
      const selected = preferredMatchId ? available.find((item) => item.match_id === preferredMatchId) : available[0];
      if (selected) await loadReport(selected.match_id);
    } catch (err) { setError(err instanceof Error ? err.message : "Không thể tải report"); }
    finally { setLoading(false); }
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setError(null); setUploading(true);
    try {
      const body = new FormData(); body.append("file", file);
      const response = await fetch(`${API_BASE}/reports`, { method: "POST", body });
      if (!response.ok) throw new Error((await response.text()).slice(0, 240));
      const created = await response.json() as { match_id?: string };
      await loadReports(created.match_id); setRoute("summary");
    } catch (err) { setError(err instanceof Error ? err.message : "Upload thất bại"); }
    finally { setUploading(false); }
  }
  useEffect(() => { void loadReports(); }, []);
  useEffect(() => { try { localStorage.setItem("rofl_route", route); } catch { /* optional */ } window.scrollTo(0, 0); }, [route]);

  const activePlayer = useMemo(() => report?.players.find((p) => p.player_id === selectedPlayer) ?? null, [report, selectedPlayer]);
  const page = nav.find((item) => item.id === route);
  if (loading) return <main className="loading-screen"><span className="status-dot" /> Loading replay reports…</main>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">R</span><span><strong>ROFL Analyzer</strong><small>v0.5 · evidence first</small></span></div>
      {["REPLAY", "ANALYSIS", "TOOLS"].map((section) => <div className="nav-group" key={section}><span className="nav-label">{section}</span>{nav.filter((item) => item.section === section).map((item) => <button className={`nav-item ${route === item.id ? "active" : ""}`} key={item.id} onClick={() => setRoute(item.id)}><span>{item.index}</span>{item.label}</button>)}</div>)}
      <div className="sidebar-footer"><span><i className="status-dot" /> Local parser ready</span><span>Replay-only mode</span><span>Riot API · not connected</span></div>
    </aside>
    <main className="main-pane"><header className="page-header"><div><p className="eyebrow">ROFL ANALYSIS LAB</p><h1>{page?.label ?? "Replay analysis"}</h1><p className="subtitle">Dữ liệu trước, coaching sau. Mỗi kết luận phải truy về evidence.</p></div><label className="primary-button">{uploading ? "Đang phân tích…" : "Phân tích replay →"}<input type="file" accept=".rofl" onChange={upload} disabled={uploading} /></label></header>
      {error && <div className="alert">{error}</div>}
      {report && <LegacyWarning report={report} />}
      {route === "upload" && <UploadScreen reports={reports} onUpload={upload} uploading={uploading} onSelect={(id) => void loadReport(id)} />}
      {route === "summary" && <SummaryScreen report={report} reports={reports} activePlayer={activePlayer} selectedPlayer={selectedPlayer} onSelectPlayer={setSelectedPlayer} onSelectReport={(id) => void loadReport(id)} onNavigate={setRoute} />}
      {route === "timeline" && <TimelineScreen report={report} />}
      {route === "players" && <PlayersScreen report={report} activePlayer={activePlayer} selectedPlayer={selectedPlayer} onSelect={setSelectedPlayer} />}
      {route === "history" && <HistoryScreen reports={reports} onSelect={(id) => { void loadReport(id); setRoute("summary"); }} />}
      {route === "objectives" && <UnavailableScreen report={report} title="Objective windows" capability="objectives" />}
      {route === "jungle" && <JungleScreen report={report} />}
    </main>
  </div>;
}

function UploadScreen({ reports, onUpload, uploading, onSelect }: { reports: Array<{ match_id: string; game?: Report["game"] }>; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; uploading: boolean; onSelect: (id: string) => void }) {
  return <section className="upload-grid"><label className="dropzone"><span className="upload-icon">↓</span><strong>{uploading ? "Parsing replay…" : "Drop .rofl file here"}</strong><span>hoặc <u>browse</u> to select · single file, up to 128MiB</span><code>~/Games/League of Legends/GameLogs/</code><input type="file" accept=".rofl" onChange={onUpload} disabled={uploading} /></label><section className="panel recent"><PanelHeading label="RECENT REPLAYS" title="History" /><div className="recent-list">{reports.length ? reports.slice(0, 6).map((item) => <button key={item.match_id} onClick={() => onSelect(item.match_id)}><span className="recent-icon">R</span><span><strong>{item.match_id}</strong><small>{label(item.game?.patch, "unknown patch")} · {formatTime(item.game?.duration_seconds)}</small></span><em>OPEN →</em></button>) : <p className="muted">Chưa có replay report.</p>}</div></section></section>;
}

function SummaryScreen({ report, reports, activePlayer, selectedPlayer, onSelectPlayer, onSelectReport, onNavigate }: { report: Report | null; reports: Array<{ match_id: string; game?: Report["game"] }>; activePlayer: Player | null; selectedPlayer: string | null; onSelectPlayer: (id: string) => void; onSelectReport: (id: string) => void; onNavigate: (route: Route) => void }) {
  if (!report) return <EmptyState title="Chưa có report" body="Upload file .rofl để tạo JSON report local." />;
  const blue = report.teams.find((team) => sideOf(team) === "blue"); const red = report.teams.find((team) => sideOf(team) === "red");
  return <><section className="match-meta"><div><span>MATCH</span><strong>{report.match_id}</strong></div><div><span>PATCH</span><strong>{label(report.game.patch)}</strong></div><div><span>DURATION</span><strong>{formatTime(report.game.duration_seconds)}</strong></div><select value={report.match_id} onChange={(e) => onSelectReport(e.target.value)}>{reports.map((item) => <option key={item.match_id} value={item.match_id}>{item.match_id}</option>)}</select></section><section className="team-header"><TeamStrip team={blue} players={report.players} patch={report.game.patch} /><div className="duration"><strong>{formatTime(report.game.duration_seconds)}</strong><span>MATCH LENGTH</span></div><TeamStrip team={red} players={report.players} patch={report.game.patch} mirrored /></section><PlayerHero player={activePlayer} patch={report.game.patch} onTimeline={() => onNavigate("timeline")} /><div className="summary-grid"><section className="panel"><PanelHeading label="TEAM COMPARISON" title="Where the game moved" /><Comparison blue={blue} red={red} /></section><Flags report={report} /></div><section className="panel players-panel"><PanelHeading label="PLAYER REPORTS" title="Tác động từng người" note="Champion nằm trong data, không nằm ở tên file" /><div className="player-table">{report.players.map((player) => <PlayerRow key={player.player_id} player={player} patch={report.game.patch} active={player.player_id === selectedPlayer} onClick={() => onSelectPlayer(player.player_id)} />)}</div></section><section className="panel evidence-panel"><PanelHeading label="ANALYSIS CONTRACT" title="Evidence coverage" /><CapabilityGrid report={report} /></section></>;
}

function TeamStrip({ team, players, patch, mirrored = false }: { team?: Team; players: Player[]; patch?: string; mirrored?: boolean }) {
  const side = sideOf(team); const members = players.filter((player) => sideOf(player) === side).slice(0, 5);
  return <div className={`team-strip ${side} ${mirrored ? "mirrored" : ""}`}><div className="team-title"><span>{side === "blue" ? "BLUE SIDE · 100" : "RED SIDE · 200"}</span><b>{label(team?.result, "—").toUpperCase()}</b></div><div className="champion-row">{members.map((player) => <ChampionTile key={player.player_id} name={player.champion} championId={player.champion_id} patch={patch} size="lg" role={player.role} />)}</div><div className="team-score"><strong>{formatNumber(team?.kills)}</strong><span>kills</span><b>·</b><strong>{formatNumber(team?.gold)}</strong><span>gold</span></div></div>;
}

function PlayerHero({ player, patch, onTimeline }: { player: Player | null; patch?: string; onTimeline: () => void }) {
  if (!player) return <section className="panel player-hero"><p className="muted">Chọn player để xem impact report.</p></section>;
  const kda = player.kda ?? {}; const stats = player.stats ?? {}; const derived = player.derived ?? {};
  return <section className={`panel player-hero ${sideOf(player)}`}><ChampionTile name={player.champion} championId={player.champion_id} patch={patch} size="xl" level={player.level} /><div className="hero-copy"><span className="eyebrow">PLAYER IMPACT</span><h2>{player.player}</h2><p>on <strong>{player.champion}</strong> · {label(player.role, "role unknown")}</p><div className="hero-stats"><Metric label="KDA" value={`${number(kda.kills)}/${number(kda.deaths)}/${number(kda.assists)}`} /><Metric label="CS · JUNGLE" value={`${formatNumber(player.cs)} · ${formatNumber(player.jungle_cs)}`} /><Metric label="GOLD" value={formatNumber(player.gold)} /><Metric label="KILL PARTICIPATION" value={percent(derived.kill_participation)} /><Metric label="OBJECTIVE DMG" value={formatNumber(stats.objective_damage)} /></div></div><div className="hero-actions"><button className="secondary-button" onClick={onTimeline}>Open timeline →</button><button className="ghost-button" disabled title="AI analysis endpoint chưa được cấu hình">Ask AI coach</button></div></section>;
}

function Comparison({ blue, red }: { blue?: Team; red?: Team }) {
  const rows = [["Kills", metric(blue, "kills"), metric(red, "kills")], ["Gold", metric(blue, "gold"), metric(red, "gold")], ["Towers", metric(blue, "towers"), metric(red, "towers")], ["Dragons", metric(blue, "dragons"), metric(red, "dragons")], ["Herald", metric(blue, "heralds"), metric(red, "heralds")], ["Baron", metric(blue, "barons"), metric(red, "barons")]] as const;
  return <div className="comparison">{rows.map(([name, left, right]) => { const max = Math.max(left, right, 1); return <div className="comparison-row" key={name}><strong>{left}</strong><span className="bar blue-bar"><i style={{ width: `${left / max * 100}%` }} /></span><label>{name}</label><span className="bar red-bar"><i style={{ width: `${right / max * 100}%` }} /></span><strong>{right}</strong></div>; })}</div>;
}

function LegacyWarning({ report }: { report: Report }) {
  const legacy = report.capabilities?.legacy_profile;
  if (!legacy || legacy.status !== "candidate") return null;
  return <div className="legacy-warning"><strong>WARNING · LEGACY PROFILE FALLBACK</strong><p>Đang giữ profile {label(legacy.profile_client_version)} để đối chiếu replay {label(legacy.target_client_version, label(report.game.patch))}.</p><small>Profile cũ chỉ là candidate; không dùng để khẳng định tọa độ, route, gank hoặc causal event.</small></div>;
}

function Flags({ report }: { report: Report }) {
  const facts = report.analysis?.facts ?? [];
  const flags = facts.slice(0, 4).map((fact, index) => ({ title: label(fact.title ?? fact.summary ?? fact.type, `Evidence ${index + 1}`), body: label(fact.body ?? fact.reason ?? fact.description, "Derived from the replay report."), severity: label(fact.severity, "INFO").toUpperCase() }));
  if (!flags.length) { flags.push({ title: "Movement semantic đang được khóa", body: label(report.movement?.reason, "Patch adapter chưa đủ bằng chứng để suy luận route, gank hoặc causal chain."), severity: "WARNING" }); flags.push({ title: "Objective windows chưa được mở", body: label(report.objectives?.reason, "Chỉ hiển thị objective khi decoder patch-specific được xác minh."), severity: "INFO" }); }
  return <section className="panel flags"><PanelHeading label="MACRO FLAGS" title="Điểm cần review" note="Natural language từ report; không chấm kỹ năng." />{flags.map((flag, index) => <article className={`flag-row ${flag.severity.toLowerCase()}`} key={`${flag.title}-${index}`}><span className="flag-severity">{flag.severity}</span><div><strong>{flag.title}</strong><p>{flag.body}</p></div><button className="ghost-button">View evidence →</button></article>)}</section>;
}

function PlayersScreen({ report, activePlayer, selectedPlayer, onSelect }: { report: Report | null; activePlayer: Player | null; selectedPlayer: string | null; onSelect: (id: string) => void }) {
  if (!report) return <EmptyState title="Chưa có player report" body="Upload một replay để xem phân tích từng người." />;
  return <section className="players-layout"><section className="panel"><PanelHeading label="PLAYER REPORTS" title="Tác động và bằng chứng" />{report.players.map((player) => <PlayerRow key={player.player_id} player={player} patch={report.game.patch} active={player.player_id === selectedPlayer} onClick={() => onSelect(player.player_id)} />)}</section><PlayerDetail player={activePlayer} patch={report.game.patch} /></section>;
}

function PlayerDetail({ player, patch }: { player: Player | null; patch?: string }) {
  if (!player) return <section className="panel"><p className="muted">Chọn một player.</p></section>;
  const stats = player.stats ?? {}; const derived = player.derived ?? {}; const jungle = player.jungle ?? {};
  const facts = [["KDA", `${number(player.kda?.kills)}/${number(player.kda?.deaths)}/${number(player.kda?.assists)}`], ["CS / jungle CS", `${formatNumber(player.cs)} / ${formatNumber(player.jungle_cs)}`], ["Gold", formatNumber(player.gold)], ["Champion damage", formatNumber(stats.champion_damage)], ["Objective damage", formatNumber(stats.objective_damage)], ["Vision score", formatNumber(stats.vision_score)], ["Takedowns before 15m", formatNumber(derived.takedowns_before_15m)], ["Enemy / own jungle CS", `${formatNumber(jungle.enemy_jungle_cs)} / ${formatNumber(jungle.own_jungle_cs)}`]];
  return <section className={`panel player-detail ${sideOf(player)}`}><div className="detail-title"><ChampionTile name={player.champion} championId={player.champion_id} patch={patch} size="md" /><div><span className="eyebrow">PLAYER</span><h2>{player.player}</h2><p>{player.champion} · {label(player.role)} · {sideOf(player)}</p></div></div><div className="fact-grid">{facts.map(([key, value]) => <div className="fact" key={key}><span>{key}</span><strong>{value}</strong></div>)}</div><div className="impact-note"><strong>Impact evidence</strong><p>Metadata verified/derived được tách khỏi inference. Movement, gank và causal chain chỉ xuất hiện khi backend có exact profile.</p></div></section>;
}

function TimelineScreen({ report }: { report: Report | null }) {
  if (!report) return <EmptyState title="Chưa có timeline" body="Upload một replay để mở timeline." />;
  const events = timelineEvents(report); const lastEvent = events[events.length - 1]; const duration = number(report.game.duration_seconds, Math.max(lastEvent ? eventTime(lastEvent) : 0, 1));
  const transport = number(report.transport.block_count);
  return <><section className="timeline-controls"><span className="active-chip">Full match</span><span>Early (0–15)</span><span>Mid (15–25)</span><span>Baron window</span><i /><label><input type="checkbox" defaultChecked /> Deaths</label><label><input type="checkbox" defaultChecked /> Objectives</label></section><section className="panel timeline-panel"><div className="timeline-axis"><span>00:00</span><strong>{formatTime(duration)} window</strong><span>{formatTime(duration)}</span></div>{events.length ? <div className="timeline-track">{events.map((event, index) => { const time = eventTime(event); const kind = eventKind(event); const side = event.side === "red" || event.team === 200 || event.taker === "red" ? "red" : "blue"; return <article className={`timeline-event ${kind} ${side}`} key={`${time}-${index}`} style={{ left: `${Math.min(100, Math.max(0, time / duration * 100))}%` }}><span className="event-marker">{kind === "death" ? "×" : "◆"}</span><time>{formatTime(time)}</time><strong>{eventTitle(event)}</strong></article>; })}</div> : <div className="unsupported"><span className="large-icon">⌁</span><h2>Chưa có semantic events</h2><p>{label(report.timeline?.reason, "Backend chưa có patch-specific decoder cho event timeline.")}</p><code>{formatNumber(transport)} transport blocks được giữ làm evidence, chưa gán thành gank/tọa độ.</code></div>}</section><section className="panel coverage-card"><PanelHeading label="COORDINATE CONTRACT" title="Không giả mạo vị trí" /><p>{label(report.movement?.reason, "Patch-specific coordinate decoder chưa được xác minh.")}</p></section></>;
}

function JungleScreen({ report }: { report: Report | null }) {
  if (!report) return <EmptyState title="Chưa có jungle economy" body="Upload một replay để mở jungle economy." />;
  const junglers = report.players.filter((player) => label(player.role).toUpperCase() === "JUNGLE");
  return <section className="players-layout"><section className="panel"><PanelHeading label="VERIFIED METADATA" title="Jungle economy" note="CS aggregate, không phải route" />{junglers.map((player) => <article className={`player-row ${sideOf(player)}`} key={player.player_id}><span className={`side-dot ${sideOf(player)}`} /><ChampionTile name={player.champion} championId={player.champion_id} patch={report.game.patch} size="sm" /><span className="player-name"><strong>{player.player}</strong><small>{player.champion} · {sideOf(player)}</small></span><span className="mono row-stat">own {formatNumber(player.jungle?.own_jungle_cs)}</span><span className="mono row-stat">enemy {formatNumber(player.jungle?.enemy_jungle_cs)}</span></article>)}</section><section className="panel unsupported-page"><span className="large-icon">◌</span><h2>Camp route chưa được giải mã</h2><p>{label(report.movement?.reason, "Không có verified movement decoder cho replay này.")}</p><small>Verified: neutral CS metadata · Unknown: camp identity, path, invade và gank.</small></section></section>;
}

function HistoryScreen({ reports, onSelect }: { reports: Array<{ match_id: string; game?: Report["game"] }>; onSelect: (id: string) => void }) {
  return <section className="panel history-panel"><PanelHeading label="REPLAY LIBRARY" title="Recent replays" />{reports.length ? reports.map((item) => <button className="history-row" key={item.match_id} onClick={() => onSelect(item.match_id)}><span className="recent-icon">R</span><div><strong>{item.match_id}</strong><small>Patch {label(item.game?.patch)} · {formatTime(item.game?.duration_seconds)}</small></div><span className="ghost-button">Open report →</span></button>) : <EmptyState title="Chưa có history" body="Các report sẽ xuất hiện ở đây sau khi upload." />}</section>;
}

function UnavailableScreen({ report, title, capability }: { report: Report | null; title: string; capability: string }) {
  const artifact = report?.[capability as "movement" | "objectives"];
  const candidate = artifact?.status === "candidate";
  return <section className="panel unsupported-page"><span className="large-icon">◌</span><h2>{title} chưa có dữ liệu semantic</h2><p>{label(artifact?.reason, "Report hiện chưa chứa artifact cho màn hình này.")}</p><small>{candidate ? "Legacy profile chỉ được dùng ở chế độ cảnh báo; cần adapter exact để mở semantic data." : "UI đã sẵn sàng để render khi backend phát hành patch adapter verified."}</small></section>;
}

function CapabilityGrid({ report }: { report: Report }) {
  const entries = Object.entries(report.capabilities ?? { movement: report.movement, objectives: report.objectives });
  return <div className="capability-grid">{entries.map(([name, value]) => { const item = asRecord(value); const status = displayStatus(item.status); return <div className="capability" key={name}><span className={`status status-${status}`}><i />{status}</span><strong>{name.replaceAll("_", " ")}</strong><p>{label(item.reason, "No reason supplied")}</p></div>; })}</div>;
}

function PlayerRow({ player, patch, active, onClick }: { player: Player; patch?: string; active: boolean; onClick: () => void }) {
  return <button className={`player-row ${active ? "active" : ""}`} onClick={onClick}><span className={`side-dot ${sideOf(player)}`} /><ChampionTile name={player.champion} championId={player.champion_id} patch={patch} size="sm" /><span className="player-name"><strong>{player.player}</strong><small>{player.champion} · {label(player.role, "role unknown")}</small></span><span className="mono kda">{number(player.kda?.kills)}/{number(player.kda?.deaths)}/{number(player.kda?.assists)}</span><span className="mono row-stat">{formatNumber(player.gold)}</span><span className="mono row-stat">{formatNumber(player.stats?.champion_damage)}</span></button>;
}

function ChampionTile({ name, championId, patch, size, role, level }: { name: string; championId?: number | null; patch?: string; size: "sm" | "md" | "lg" | "xl"; role?: string; level?: number }) {
  const [failed, setFailed] = useState(false); const src = championImage(name, championId, patch);
  return <span className={`champion-wrap ${size}`}><span className={`champion-tile ${size}`}><span>{name.slice(0, 1).toUpperCase()}</span>{src && !failed && <img src={src} alt="" onError={() => setFailed(true)} />}</span>{role && <small>{role}</small>}{level ? <b className="level-badge">{level}</b> : null}</span>;
}

function Metric({ label: metricLabel, value }: { label: string; value: string }) { return <div className="metric"><span>{metricLabel}</span><strong>{value}</strong></div>; }
function PanelHeading({ label: headingLabel, title, note }: { label: string; title: string; note?: string }) { return <div className="panel-heading"><div><span className="section-label">{headingLabel}</span><h2>{title}</h2></div>{note && <span className="panel-note">{note}</span>}</div>; }
function EmptyState({ title, body }: { title: string; body: string }) { return <section className="empty-state"><span className="large-icon">⌁</span><h2>{title}</h2><p>{body}</p></section>; }

export default App;
