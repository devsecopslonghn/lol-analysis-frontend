import { ChangeEvent, useEffect, useMemo, useState } from "react";

type Player = {
  player_id: string;
  player: string;
  tag: string | null;
  champion: string;
  side: "blue" | "red" | "unknown";
  role: string;
  result: "win" | "loss";
  kda: { kills: number; deaths: number; assists: number };
  level: number;
  gold: number;
  cs: number;
  jungle_cs: number;
  jungle: { enemy_jungle_cs: number; own_jungle_cs: number };
  stats: {
    champion_damage: number;
    building_damage: number;
    objective_damage: number;
    epic_monster_damage: number;
    time_dead_seconds: number;
    vision_score: number;
    wards_placed: number;
    wards_killed: number;
    crowd_control_seconds: number;
  };
  objectives: { dragons: number; heralds: number; barons: number };
  derived: {
    kill_participation: number | null;
    last_takedown_seconds: number;
    takedowns_before_15m: number;
    structure_takedowns: number;
    epic_monster_takedowns: number;
    time_disconnected_seconds: number;
    time_played_seconds: number;
  };
  impact?: {
    dimensions: {
      tempo: { takedowns_before_15m: number };
      resource: { gold: number; cs: number; jungle_cs: number };
      combat: { kill_participation: number | null; damage_share: number | null; time_dead_ratio: number | null };
      objective: { epic_monster_takedowns: number; objective_damage: number; structure_takedowns: number };
      map: { vision_score: number; wards_placed: number };
    };
  };
};

type Team = {
  team: number;
  side: string;
  result: string;
  kills: number;
  deaths: number;
  assists: number;
  gold: number;
  champion_damage: number;
  time_dead_seconds: number;
  avg_level: number;
};

type TransportObservation = { opcode: number; hex: string; count: number; first_timestamp_seconds: number; last_timestamp_seconds: number };
type TransportArtifact = { file: string; opcodes: string[]; count: number; status: string; semantic_status: string };
type Transport = { block_count: number; distinct_opcodes: number; first_timestamp_seconds: number | null; last_timestamp_seconds: number | null; opcode_observations: TransportObservation[]; artifacts?: TransportArtifact[]; legacy_profile_reference?: { status: string; profile_client_version: string; candidate_opcode: string; applies_to_client_version: boolean } };

type Report = {
  match_id: string;
  game: { patch: string; duration_seconds: number | null };
  teams: Team[];
  players: Player[];
  transport: Transport;
  movement: { status: string; transport_observations?: TransportObservation[]; transport_artifacts?: TransportArtifact[]; legacy_profile_reference?: Transport["legacy_profile_reference"] };
  capabilities: Record<string, { status: string; reason: string }>;
  analysis: { facts: Array<Record<string, unknown>>; inferences: unknown[]; unknowns: string[] };
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function App() {
  const [reports, setReports] = useState<Array<{ match_id: string; game: Report["game"] }>>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadReports() {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/reports`);
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = (await response.json()) as { reports: typeof reports };
      setReports(data.reports);
      if (data.reports[0]) await loadReport(data.reports[0].match_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải report");
    } finally {
      setLoading(false);
    }
  }

  async function loadReport(matchId: string) {
    const response = await fetch(`${API_BASE}/reports/${encodeURIComponent(matchId)}`);
    if (!response.ok) throw new Error(`Không tải được report ${matchId}`);
    const data = (await response.json()) as Report;
    setReport(data);
    setSelectedPlayer(data.players[0]?.player_id ?? null);
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await fetch(`${API_BASE}/reports`, { method: "POST", body });
      if (!response.ok) throw new Error(await response.text());
      await loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload thất bại");
    }
  }

  useEffect(() => { void loadReports(); }, []);

  const activePlayer = useMemo(
    () => report?.players.find((player) => player.player_id === selectedPlayer) ?? null,
    [report, selectedPlayer],
  );

  if (loading) return <main className="shell"><div className="loading">Đang tải replay reports…</div></main>;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">ROFL ANALYSIS LAB</p>
          <h1>Replay impact dashboard</h1>
          <p className="subtitle">Dữ liệu trước, coaching sau. Mỗi kết luận phải truy về evidence.</p>
        </div>
        <label className="upload">
          <span>Phân tích replay</span>
          <input type="file" accept=".rofl" onChange={upload} />
        </label>
      </header>

      {error && <div className="alert">{error}</div>}
      {reports.length === 0 && <section className="empty"><h2>Chưa có report</h2><p>Upload file `.rofl` để tạo JSON report local.</p></section>}

      {report && (
        <>
          <section className="match-header">
            <div><span className="label">MATCH</span><strong>{report.match_id}</strong></div>
            <div><span className="label">PATCH</span><strong>{report.game.patch}</strong></div>
            <div><span className="label">DURATION</span><strong>{formatDuration(report.game.duration_seconds)}</strong></div>
            <select value={report.match_id} onChange={(event) => void loadReport(event.target.value)}>
              {reports.map((item) => <option value={item.match_id} key={item.match_id}>{item.match_id}</option>)}
            </select>
          </section>

          <section className="team-grid">
            {report.teams.map((team) => <TeamCard team={team} key={team.team} />)}
          </section>

          <section className="transport-strip">
            <div><span className="label">TRANSPORT EVIDENCE</span><strong>{formatNumber(report.transport.block_count)} blocks</strong></div>
            <div><span className="label">OPCODES</span><strong>{report.transport.distinct_opcodes} observed</strong></div>
            <div><span className="label">MOVEMENT SIGNAL</span><strong>{formatNumber(report.transport.opcode_observations.find((item) => item.hex === "0x022c")?.count ?? 0)} × 0x022c</strong></div>
            <div><span className="label">LEGACY PROFILE</span><strong>{report.movement.legacy_profile_reference?.profile_client_version ?? "none"}</strong></div>
            <div><span className="label">SEMANTIC</span><strong>{report.movement.status}</strong></div>
          </section>

          <div className="capability-strip">
            {Object.entries(report.capabilities).map(([name, value]) => (
              <span className={`status status-${value.status}`} key={name}>{name}: {value.status}</span>
            ))}
          </div>

          <section className="content-grid">
            <div className="panel">
              <div className="panel-heading"><div><span className="label">PLAYER REPORTS</span><h2>Tác động từng người</h2></div><span className="muted">Champion nằm trong data, không nằm ở tên file</span></div>
              <div className="player-list">{report.players.map((player) => <PlayerRow player={player} active={player.player_id === selectedPlayer} onClick={() => setSelectedPlayer(player.player_id)} key={player.player_id} />)}</div>
            </div>
            <PlayerDetail player={activePlayer} />
          </section>

          <section className="panel signals-panel">
            <div className="panel-heading"><div><span className="label">PLAYER SIGNALS</span><h2>Điểm tác động có evidence</h2></div><span className="muted">Derived từ metadata; không phải điểm chấm kỹ năng</span></div>
            <ImpactPanel player={activePlayer} />
          </section>

          <section className="panel next-panel"><div className="panel-heading"><div><span className="label">ANALYSIS CONTRACT</span><h2>Movement và event semantic</h2></div></div><p className="notice">`0x022c` đã có artifact theo timestamp để adapter tương lai đọc, nhưng vẫn là transport-only. Profile legacy {report.movement.legacy_profile_reference?.profile_client_version ?? "—"} chỉ là tham chiếu và không áp dụng cho patch hiện tại; tọa độ, gank, invade và causal chain chỉ được mở khi backend có exact profile verified.</p></section>
        </>
      )}
    </main>
  );
}

function TeamCard({ team }: { team: Team }) {
  return <article className={`team-card ${team.side}`}><div className="team-title"><span>{team.side === "blue" ? "ĐỘI XANH" : "ĐỘI ĐỎ"}</span><strong>{team.result === "win" ? "WIN" : "LOSS"}</strong></div><div className="team-score">{team.kills} <small>kills</small> <span>/</span> {formatNumber(team.gold)} <small>gold</small></div><div className="team-meta"><span>{formatNumber(team.champion_damage)} damage</span><span>{team.avg_level} avg level</span><span>{formatDuration(team.time_dead_seconds)} dead</span></div></article>;
}

function PlayerRow({ player, active, onClick }: { player: Player; active: boolean; onClick: () => void }) {
  return <button className={`player-row ${active ? "active" : ""}`} onClick={onClick}><span className={`dot ${player.side}`} /><span className="player-name"><strong>{player.player}</strong><small>{player.champion} · {player.role}</small></span><span className="kda">{player.kda.kills}/{player.kda.deaths}/{player.kda.assists}</span><span className="gold">{formatNumber(player.gold)}</span><span className="damage">{formatNumber(player.stats.champion_damage)}</span></button>;
}

function PlayerDetail({ player }: { player: Player | null }) {
  if (!player) return <aside className="panel detail"><p className="muted">Chọn một player để xem chi tiết.</p></aside>;
  const facts = [
    ["KDA", `${player.kda.kills}/${player.kda.deaths}/${player.kda.assists}`],
    ["CS / jungle CS", `${player.cs} / ${player.jungle_cs}`],
    ["Gold", formatNumber(player.gold)],
    ["Champion damage", formatNumber(player.stats.champion_damage)],
    ["Building damage", formatNumber(player.stats.building_damage)],
    ["Objective damage", formatNumber(player.stats.objective_damage)],
    ["Vision / wards", `${player.stats.vision_score} / ${player.stats.wards_placed}`],
    ["Takedowns before 15m", String(player.derived.takedowns_before_15m)],
    ["Enemy / own jungle CS", `${player.jungle.enemy_jungle_cs} / ${player.jungle.own_jungle_cs}`],
    ["Active / disconnected", `${formatDuration(player.derived.time_played_seconds - player.derived.time_disconnected_seconds)} / ${formatDuration(player.derived.time_disconnected_seconds)}`],
  ];
  return <aside className="panel detail"><div className="detail-heading"><span className={`dot ${player.side}`} /><div><span className="label">PLAYER</span><h2>{player.player}</h2><p>{player.champion} · {player.role} · {player.side}</p></div></div><div className="fact-grid">{facts.map(([key, value]) => <div className="fact" key={key}><span>{key}</span><strong>{value}</strong></div>)}</div><div className="detail-note"><strong>Impact evidence</strong><p>Report mới chỉ sử dụng metadata verified/derived. Movement, gank, invade và causal chain sẽ xuất hiện khi patch semantic được xác minh.</p></div></aside>;
}

function ImpactPanel({ player }: { player: Player | null }) {
  if (!player?.impact) return <p className="muted">Report chưa có impact dimensions.</p>;
  const dimensions = player.impact.dimensions;
  const signals = [
    ["Tempo", `${dimensions.tempo.takedowns_before_15m} takedowns trước 15m`, dimensions.tempo.takedowns_before_15m, 15],
    ["Combat", `${percent(dimensions.combat.kill_participation)} KP · ${percent(dimensions.combat.damage_share)} damage`, (dimensions.combat.kill_participation ?? 0) * 100, 100],
    ["Objective", `${dimensions.objective.epic_monster_takedowns} epic · ${dimensions.objective.structure_takedowns} structures`, dimensions.objective.epic_monster_takedowns, 8],
    ["Jungle", `${player.jungle.enemy_jungle_cs} enemy · ${player.jungle.own_jungle_cs} own CS`, player.jungle.enemy_jungle_cs, 50],
  ] as const;
  return <div className="signal-grid">{signals.map(([name, detail, value, max]) => <div className="signal" key={name}><div className="signal-title"><strong>{name}</strong><span>{detail}</span></div><div className="meter"><span style={{ width: `${Math.min(100, Math.max(4, (value / max) * 100))}%` }} /></div></div>)}</div>;
}

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export default App;
