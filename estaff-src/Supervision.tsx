"use client";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import LykosBrand from "./LykosBrand";
import styles from "./supervision.module.css";
import theme from "./theme.module.css";

const SERVICE = "https://performance-hub-lykos-fc.fab-mysterio.chatgpt.site/api/estaff";
const OSCAR_ID = "oscar";
const ESTAFF_AGENT_COUNT = 28;
const ACTIVE_CONTRIBUTORS = 27;
const TOTAL_REPORT_PROMPT = "Rapport total : sollicite tous les agents actifs et autorisés. Attends leurs retours, indique clairement qui a répondu, qui est bloqué ou sans réponse, puis livre-moi une synthèse globale avec les priorités, les décisions à prendre, les responsables et les échéances.";
const SPORTEASY_SYNC_PROMPT = "ACTION_SYSTÈME PUB2 : déclenche immédiatement le workflow officiel de synchronisation SportEasy complète vers le Performance Hub, puis confirme uniquement son lancement.";

type ChatMessage = { role: "user" | "agent"; text: string };
type BridgeState = "checking" | "ready" | "offline";

function serviceRequest(path: string, token: string, init: RequestInit = {}) {
  return fetch(new Request(`${SERVICE}${path}`, {
    ...init,
    mode: "cors",
    cache: "no-store",
    headers: {...init.headers, Authorization: `Bearer ${token}`},
  }));
}

const wait = (delay: number) => new Promise(resolve => setTimeout(resolve, delay));

async function publishedSyncTime() {
  const response = await fetch(`/performance-hub/team-data.js?sync_status=${Date.now()}`, {cache:"no-store"});
  if (!response.ok) throw new Error("sync_status_unavailable");
  const source = await response.text();
  const generatedAt = source.match(/"generatedAt"\s*:\s*"([^"]+)"/)?.[1];
  const timestamp = Date.parse(generatedAt || "");
  if (!Number.isFinite(timestamp)) throw new Error("sync_status_invalid");
  return timestamp;
}

function syncAgeLabel(timestamp: number | null) {
  if (!timestamp) return "Dernière synchronisation inconnue";
  const hours = Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000));
  return `Dernière synchronisation il y a ${hours} h`;
}

function readableServiceError(error: unknown) {
  if (error === "read_only") return "Cette mission ne peut pas être lancée depuis cette interface.";
  return typeof error === "string" && error.trim() ? error : "Le moteur privé ne répond pas.";
}

export default function Supervision({onLogout, sessionToken}: {onLogout: () => void; sessionToken: string}) {
  const [bridge, setBridge] = useState<BridgeState>("checking");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [syncTime, setSyncTime] = useState<number | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [, refreshClock] = useState(0);
  const conversationId = useRef(crypto.randomUUID().replace(/-/g, ""));
  const messageEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const check = () => serviceRequest("/status", sessionToken, {signal: controller.signal})
      .then(response => {if (!response.ok) throw new Error(); return response.json();})
      .then(data => setBridge(data.status === "ready" ? "ready" : "offline"))
      .catch(() => {if (!controller.signal.aborted) setBridge("offline");});
    check();
    const interval = window.setInterval(check, 15000);
    return () => {controller.abort(); window.clearInterval(interval);};
  }, [sessionToken]);

  useEffect(() => {
    let active = true;
    const refresh = () => publishedSyncTime().then(value => {if (active) setSyncTime(value);}).catch(() => {});
    void refresh();
    const interval = window.setInterval(() => {refreshClock(value => value + 1); void refresh();}, 60_000);
    return () => {active = false; window.clearInterval(interval);};
  }, []);

  useEffect(() => messageEnd.current?.scrollIntoView({behavior: "smooth", block: "nearest"}), [messages, busy]);

  async function submit(text: string) {
    if (!text || busy || bridge !== "ready") return;
    setMessages(current => [...current, {role: "user", text}]);
    setDraft("");
    setBusy(true);
    try {
      const response = await serviceRequest("/jobs", sessionToken, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({agent: OSCAR_ID, conversationId: conversationId.current, message: text}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(readableServiceError(data.error));
      const deadline = Date.now() + 720000;
      let result = data;
      while (Date.now() < deadline) {
        await wait(1200);
        const pending = await serviceRequest(`/jobs/${data.id}`, sessionToken);
        result = await pending.json();
        if (pending.status === 202) continue;
        if (!pending.ok || result.error) throw new Error(result.error || "Le moteur privé ne répond pas.");
        break;
      }
      if (result.status !== "complete" || !result.answer) throw new Error("Oscar a dépassé le temps prévu pour terminer cette mission.");
      setMessages(current => [...current, {role: "agent", text: result.answer}]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Le moteur privé ne répond pas.";
      setMessages(current => [...current, {role: "agent", text: `Je n’ai pas pu terminer cette mission : ${message}`}]);
    } finally {
      setBusy(false);
    }
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    void submit(draft.trim());
  }

  function handleComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit(draft.trim());
    }
  }

  async function requestSportEasySync() {
    if (syncBusy || bridge !== "ready") return;
    const previousSync = syncTime;
    setSyncBusy(true);
    setSyncMessage("Lancement du workflow…");
    try {
      const response = await serviceRequest("/jobs", sessionToken, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({agent:OSCAR_ID, conversationId:`sporteasy-sync-${Date.now()}`, message:SPORTEASY_SYNC_PROMPT}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(readableServiceError(data.error));
      const jobDeadline = Date.now() + 120_000;
      while (Date.now() < jobDeadline) {
        await wait(1_200);
        const pending = await serviceRequest(`/jobs/${data.id}`, sessionToken);
        const result = await pending.json();
        if (pending.status === 202) continue;
        if (!pending.ok || result.error) throw new Error(result.error || "Le workflow n’a pas pu être lancé.");
        break;
      }
      setSyncMessage("Workflow lancé · publication en cours");
      const publicationDeadline = Date.now() + 12 * 60_000;
      while (Date.now() < publicationDeadline) {
        await wait(10_000);
        const latest = await publishedSyncTime();
        setSyncTime(latest);
        if (!previousSync || latest > previousSync) {
          setSyncMessage("Synchronisation publiée");
          return;
        }
      }
      setSyncMessage("Workflow lancé · vérification encore en cours");
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Synchronisation impossible pour le moment.");
    } finally {
      setSyncBusy(false);
    }
  }

  const statusText = bridge === "checking" ? "Connexion en cours…" : bridge === "ready" ? busy ? "Oscar coordonne la mission…" : "Oscar est prêt" : "Oscar est momentanément hors ligne";

  return <main className={`${styles.shell} ${theme.surface}`}>
    <header className={styles.header}>
      <LykosBrand />
      <div className={styles.titleBlock}><h1>Oscar<span>.</span></h1><p>eChief of Staff du Lykos FC</p></div>
      <form onSubmit={event => {event.preventDefault(); onLogout();}}><button>Fermer l’accès ↗</button></form>
    </header>

    <section className={styles.syncBar} aria-label="Synchronisation SportEasy">
      <small>{syncAgeLabel(syncTime)}</small>
      <button type="button" onClick={() => void requestSportEasySync()} disabled={bridge !== "ready" || syncBusy} aria-label="Relancer maintenant la synchronisation SportEasy" title="Relancer maintenant la synchronisation SportEasy">{syncBusy ? "…" : "🔄"}</button>
      {syncMessage && <span role="status">{syncMessage}</span>}
    </section>

    <section className={styles.commandBar} aria-label="Fonctionnement d’Oscar">
      <div><strong>1</strong><span>interlocuteur unique</span></div>
      <div><strong>{ESTAFF_AGENT_COUNT}</strong><span>agents eStaff, Oscar compris</span></div>
      <div><strong>{ACTIVE_CONTRIBUTORS}</strong><span>contributeurs mobilisables</span></div>
      <p className={bridge === "ready" ? styles.online : styles.waiting}><i aria-hidden="true" />{statusText}</p>
    </section>

    <div className={styles.workspace}>
      <section className={styles.conversation} aria-label="Conversation avec Oscar">
        <header className={styles.chatHeader}>
          <span className={styles.avatar} aria-hidden="true">🧭</span>
          <div><h2>Oscar</h2><p>Vous lui confiez la mission. Il choisit les bonnes personnes, croise leurs retours et vous répond.</p></div>
          <span className={`${styles.status} ${bridge === "ready" ? styles.statusReady : ""}`}>{statusText}</span>
        </header>

        <div className={styles.messages} aria-live="polite">
          {!messages.length && <div className={styles.welcome}>
            <span aria-hidden="true">🧭</span>
            <h2>Quelle mission dois-je piloter ?</h2>
            <p>Parlez-moi comme vous le feriez avec votre bras droit. Je missionnerai les agents utiles et je vous rendrai une réponse unifiée.</p>
            <button type="button" disabled={bridge !== "ready" || busy} onClick={() => setDraft(TOTAL_REPORT_PROMPT)}><span>Rapport total</span><small>Demander le retour de tous les agents actifs</small></button>
          </div>}
          {messages.map((message, index) => <article key={`${message.role}-${index}`} className={`${styles.chatMessage} ${message.role === "user" ? styles.userMessage : styles.agentMessage}`}>
            <strong>{message.role === "user" ? "Vous" : "Oscar"}</strong>
            <p>{message.text}</p>
          </article>)}
          {busy && <article className={`${styles.chatMessage} ${styles.agentMessage} ${styles.thinking}`}><strong>Oscar</strong><p><span aria-hidden="true">●</span><span aria-hidden="true">●</span><span aria-hidden="true">●</span> Je qualifie la mission, mobilise les bons agents et contrôle leurs retours.</p></article>}
          <div ref={messageEnd} />
        </div>

        <div className={styles.quickActions}>
          <button type="button" disabled={bridge !== "ready" || busy} onClick={() => setDraft(TOTAL_REPORT_PROMPT)}>Rapport total</button>
          <span>Entrée pour envoyer · Maj + Entrée pour une nouvelle ligne</span>
        </div>
        <form className={styles.composer} onSubmit={sendMessage}>
          <textarea disabled={bridge !== "ready" || busy} aria-label="Votre mission pour Oscar" rows={3} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={handleComposerKey} placeholder={bridge === "ready" ? "Confiez une mission à Oscar…" : "Oscar est momentanément indisponible"}/>
          <button disabled={bridge !== "ready" || busy || !draft.trim()} aria-label="Envoyer la mission">{busy ? "…" : "↑"}</button>
        </form>
        <p className={styles.note}>Oscar peut analyser, organiser et préparer. Toute publication, dépense, suppression ou communication externe reste soumise à votre validation.</p>
      </section>

      <aside className={styles.method} aria-label="Méthode d’Oscar">
        <p className={styles.eyebrow}>CHEF D’ORCHESTRE</p>
        <h2>Une demande.<br/>Une réponse.<br/>Toute l’équipe utile.</h2>
        <ol>
          <li><strong>Comprendre</strong><span>Oscar clarifie l’objectif, l’urgence et la décision attendue.</span></li>
          <li><strong>Missionner</strong><span>Il active uniquement les spécialistes nécessaires.</span></li>
          <li><strong>Contrôler</strong><span>Il vérifie les sources, leur date et les contradictions.</span></li>
          <li><strong>Décider ou remonter</strong><span>Il arbitre dans son mandat et vous soumet le reste.</span></li>
        </ol>
        <div className={styles.totalReport}><span>RAPPORT TOTAL</span><p>Les {ACTIVE_CONTRIBUTORS} autres agents peuvent être sollicités par Oscar. Il attend chaque retour et signale toute absence ou tout blocage avant sa synthèse.</p></div>
      </aside>
    </div>

    <footer className={styles.footer}><a href="/performance-hub/">← Retour au Performance Hub</a><span>Canal privé · Oscar uniquement</span></footer>
  </main>;
}
