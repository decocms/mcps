/**
 * Google Calendar → deco MCP notifier (per-user).
 *
 * Runs in YOUR Google account. A time-driven trigger polls your calendar and
 * POSTs "upcoming meeting" events to the deco Google Calendar MCP, which
 * forwards them to your studio automation. An installable onEventUpdated
 * trigger reports created/updated/deleted events.
 *
 * SETUP
 *   1. https://script.google.com → New project, paste this file.
 *   2. Replace the CONFIG block below with the values from the MCP tool
 *      `get_apps_script_config` (run it after configuring the trigger in the
 *      studio so this connection has a delivery callback).
 *   3. Run `setup` once and authorize the script.
 *
 * Quotas (Apps Script): UrlFetchApp ~20k calls/day (consumer), trigger total
 * runtime 90 min/day (consumer) / 6 h/day (Workspace). A 5-min poll is well
 * within these.
 */

// ============================ CONFIG (replace) ============================
const WEBHOOK_URL =
  "https://sites-google-calendar.deco.site/calendar/events/REPLACE_CONNECTION_ID";
const WEBHOOK_TOKEN = "REPLACE_TOKEN";
const LEAD_MINUTES = 10; // notify this many minutes before an event
const POLL_WINDOW_MIN = 15; // how far ahead each poll scans (>= LEAD_MINUTES)
const CALENDAR_ID = "primary"; // "primary" or a specific calendar id
// =========================================================================

/** Create the time-driven + onEventUpdated triggers. Run once. */
function setup() {
  // Clear any existing triggers for these handlers to avoid duplicates.
  const handlers = ["checkUpcoming", "onCalendarChange"];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("checkUpcoming").timeBased().everyMinutes(5).create();

  ScriptApp.newTrigger("onCalendarChange")
    .forUserCalendar(Session.getEffectiveUser().getEmail())
    .onEventUpdated()
    .create();

  Logger.log("Triggers created: checkUpcoming (5 min) + onCalendarChange.");
}

/** Time-driven: notify for events starting within LEAD_MINUTES. */
function checkUpcoming() {
  const cal =
    CALENDAR_ID === "primary"
      ? CalendarApp.getDefaultCalendar()
      : CalendarApp.getCalendarById(CALENDAR_ID);
  if (!cal) {
    Logger.log("Calendar not found: " + CALENDAR_ID);
    return;
  }

  const now = new Date();
  const ahead = new Date(now.getTime() + POLL_WINDOW_MIN * 60 * 1000);
  const events = cal.getEvents(now, ahead);
  const props = PropertiesService.getScriptProperties();

  events.forEach(function (ev) {
    const start = ev.getStartTime();
    const minutesUntilStart = Math.round(
      (start.getTime() - now.getTime()) / 60000,
    );
    if (minutesUntilStart > LEAD_MINUTES) return;

    // Dedup: notify each occurrence once. Key includes the start time so
    // recurring instances each notify, but the same instance never twice.
    const key = "upcoming:" + ev.getId() + ":" + start.getTime();
    if (props.getProperty(key)) return;

    post("google-calendar.event.upcoming", {
      event_id: ev.getId(),
      calendar_id: CALENDAR_ID,
      summary: ev.getTitle(),
      description: ev.getDescription(),
      location: ev.getLocation(),
      start: start.toISOString(),
      end: ev.getEndTime().toISOString(),
      minutes_until_start: minutesUntilStart,
      attendees: ev.getGuestList().map(function (g) {
        return { email: g.getEmail(), status: String(g.getGuestStatus()) };
      }),
      html_link: null,
    });

    props.setProperty(key, "1");
  });

  cleanupOldKeys_(props, now);
}

/**
 * Installable onEventUpdated trigger: report created/updated/deleted events.
 * The event object only carries the calendarId, so we rescan the recent window
 * and emit changes. We keep a snapshot of known event ids to classify changes.
 */
function onCalendarChange(e) {
  const cal =
    CALENDAR_ID === "primary"
      ? CalendarApp.getDefaultCalendar()
      : CalendarApp.getCalendarById(CALENDAR_ID);
  if (!cal) return;

  const props = PropertiesService.getScriptProperties();
  const now = new Date();
  // Look at a window around now for changed events (past 1h .. next 30 days).
  const from = new Date(now.getTime() - 60 * 60 * 1000);
  const to = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const events = cal.getEvents(from, to);

  const prevRaw = props.getProperty("known_ids");
  const prev = prevRaw ? JSON.parse(prevRaw) : {};
  const current = {};

  events.forEach(function (ev) {
    const id = ev.getId();
    const fingerprint =
      ev.getLastUpdated().getTime() + "|" + ev.getStartTime().getTime();
    current[id] = fingerprint;

    if (!prev[id]) {
      emitChange_("google-calendar.event.created", ev);
    } else if (prev[id] !== fingerprint) {
      emitChange_("google-calendar.event.updated", ev);
    }
  });

  // Deleted: present before, gone now.
  Object.keys(prev).forEach(function (id) {
    if (!current[id]) {
      post("google-calendar.event.deleted", {
        event_id: id,
        calendar_id: CALENDAR_ID,
      });
    }
  });

  props.setProperty("known_ids", JSON.stringify(current));
}

function emitChange_(type, ev) {
  post(type, {
    event_id: ev.getId(),
    calendar_id: CALENDAR_ID,
    summary: ev.getTitle(),
    description: ev.getDescription(),
    location: ev.getLocation(),
    start: ev.getStartTime().toISOString(),
    end: ev.getEndTime().toISOString(),
  });
}

/** POST {type, data} to the MCP webhook with the bearer token. */
function post(type, data) {
  try {
    UrlFetchApp.fetch(WEBHOOK_URL, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + WEBHOOK_TOKEN },
      payload: JSON.stringify({ type: type, data: data }),
      muteHttpExceptions: true,
    });
  } catch (err) {
    Logger.log("POST failed (" + type + "): " + err);
  }
}

/** Drop dedup keys for events that already started (keep props small). */
function cleanupOldKeys_(props, now) {
  const all = props.getProperties();
  Object.keys(all).forEach(function (key) {
    if (key.indexOf("upcoming:") !== 0) return;
    const parts = key.split(":");
    const startMs = Number(parts[parts.length - 1]);
    if (startMs && startMs < now.getTime() - 60 * 60 * 1000) {
      props.deleteProperty(key);
    }
  });
}
