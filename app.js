// app.js
// Main logic for the HR Timecard Checker (browser-only, no backend).
// Truth source: TIME IN / LUNCH / TIME OUT (worked hours) + SICK LEAVE (entered).

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------

let rawCsvText = "";
let parsedRows = [];     // array of { [UPPER_HEADER_NAME]: value }
let headerRow = [];      // original header labels

// Employee metadata
let employeeName = "";
let payBeginDate = "";
let payEndDate = "";
let payDate = "";

// Payroll totals from footer
let payrollTotalRegularHours = null;
let payrollTotalSickHours = null;
let payrollTotalOvertimeHours = null;
let payrollTotalHours = null;

// Policy: "DAILY_OT" for Lu, "WEEKLY_OT" for everyone else
let employeePolicy = "WEEKLY_OT";

// UI elements
const fileInput = document.getElementById("fileInput");
const runCheckBtn = document.getElementById("runCheckBtn");
const summaryCard = document.getElementById("summaryCard");
const summaryContent = document.getElementById("summaryContent");
const tableCard = document.getElementById("tableCard");
const tableContainer = document.getElementById("tableContainer");
const downloadCard = document.getElementById("downloadCard");
const downloadCsvBtn = document.getElementById("downloadCsvBtn");
const downloadPdfBtn = document.getElementById("downloadPdfBtn");

// ---------------------------------------------------------------------------
// UI Events
// ---------------------------------------------------------------------------

// Enable/disable Run button based on file selection
fileInput.addEventListener("change", () => {
  runCheckBtn.disabled = !(fileInput.files && fileInput.files.length > 0);
});

// When HR clicks "Run Check"
runCheckBtn.addEventListener("click", () => {
  const file = fileInput.files[0];
  if (!file) {
    alert("Please select a CSV file first.");
    return;
  }

  const reader = new FileReader();

  reader.onload = (event) => {
    rawCsvText = event.target.result;
    try {
      processCsv(rawCsvText);
      showPreviewResults();
    } catch (err) {
      console.error(err);
      alert("There was a problem reading this CSV. Check the console for details.");
    }
  };

  reader.onerror = () => {
    alert("Error reading file. Please try again.");
  };

  reader.readAsText(file);
});

// PDF button: only enabled when no errors (controlled later)
downloadPdfBtn.addEventListener("click", () => {
  // Ensure print view is populated before print
  populatePrintView();
  window.print(); // user chooses "Save as PDF"
});

// ---------------------------------------------------------------------------
// CSV parsing & metadata
// ---------------------------------------------------------------------------

function processCsv(csvText) {
  const allLines = csvText.split(/\r?\n/);
  const nonEmptyLines = allLines.filter((line) => line.trim() !== "");
  if (nonEmptyLines.length === 0) {
    throw new Error("CSV appears to be empty.");
  }

  // Reset globals
  parsedRows = [];
  headerRow = [];
  employeeName = "";
  payBeginDate = "";
  payEndDate = "";
  payDate = "";
  payrollTotalRegularHours = null;
  payrollTotalSickHours = null;
  payrollTotalOvertimeHours = null;
  payrollTotalHours = null;
  employeePolicy = "WEEKLY_OT";

  // 1) EMPLOYEE NAME + dates
  const employeeHeaderIndex = nonEmptyLines.findIndex((line) =>
    line.toUpperCase().includes("EMPLOYEE NAME")
  );

  if (employeeHeaderIndex !== -1 && employeeHeaderIndex + 1 < nonEmptyLines.length) {
    const headerCells = splitCsvLine(nonEmptyLines[employeeHeaderIndex]);
    const valueCells = splitCsvLine(nonEmptyLines[employeeHeaderIndex + 1]);

    const metaMap = {};
    headerCells.forEach((rawHeader, idx) => {
      const key = rawHeader.trim().toUpperCase();
      const value = (valueCells[idx] || "").trim();
      if (key && value) {
        metaMap[key] = value;
      }
    });

    employeeName = metaMap["EMPLOYEE NAME"] || "";
    payBeginDate = metaMap["PAY BEGIN DATE"] || "";
    payEndDate = metaMap["PAY END DATE"] || "";
    payDate = metaMap["PAY DATE"] || "";

    const nameUpper = (employeeName || "").trim().toUpperCase();
    employeePolicy = (nameUpper === "LU HERNANDEZ") ? "DAILY_OT" : "WEEKLY_OT";

    console.log("Employee metadata:", {
      employeeName,
      payBeginDate,
      payEndDate,
      payDate,
      employeePolicy
    });
  }

  // 2) Data header row (DAY + TIME IN)
  const dataHeaderIndex = nonEmptyLines.findIndex((line) => {
    const upper = line.toUpperCase();
    return upper.includes("DAY") && upper.includes("TIME IN");
  });

  if (dataHeaderIndex === -1) {
    throw new Error('Could not find a header row containing both "DAY" and "TIME IN".');
  }

  headerRow = splitCsvLine(nonEmptyLines[dataHeaderIndex]);
  console.log("Header columns:", headerRow);

  // 3) Parse rows beneath header, but STOP after the TOTAL HOURS footer row
  const rows = [];
  for (let i = dataHeaderIndex + 1; i < nonEmptyLines.length; i++) {
    const line = nonEmptyLines[i];
    if (!line.trim()) continue;

    const values = splitCsvLine(line);
    const rowObj = {};
    headerRow.forEach((colName, idx) => {
      const key = colName.trim().toUpperCase();
      rowObj[key] = values[idx] !== undefined ? values[idx].trim() : "";
    });
    rows.push(rowObj);

    // IMPORTANT: stop parsing after the bottom TOTAL HOURS footer row
    if (isTotalsFooterRow(rowObj)) {
      break;
    }
  }
  parsedRows = rows;

  // 4) Detect payroll totals footer row (used for summary only)
  detectPayrollTotalsFromFooter(nonEmptyLines, dataHeaderIndex);
}

function splitCsvLine(line) {
  return line.split(",");
}

function parseNumberOrNull(str) {
  if (str === undefined || str === null) return null;
  const trimmed = String(str).trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function detectPayrollTotalsFromFooter(nonEmptyLines, dataHeaderIndex) {
  const isDailyHeaderLine = (line) => {
    const upper = line.toUpperCase();
    return upper.includes("DAY") && upper.includes("TIME IN");
  };

  const looksLikeDailyRowByCells = (cells) => {
    if (!cells || cells.length === 0) return false;
    const dayCell = (cells[0] || "").trim().toUpperCase();
    const dayNames = [
      "MONDAY", "TUESDAY", "WEDNESDAY",
      "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"
    ];
    return dayNames.includes(dayCell);
  };

  for (let i = dataHeaderIndex + 1; i < nonEmptyLines.length; i++) {
    const line = nonEmptyLines[i];
    if (!line.trim()) continue;

    const upperLine = line.toUpperCase();
    if (!upperLine.includes("TOTAL HOURS")) continue;
    if (isDailyHeaderLine(line)) continue;

    const cells = splitCsvLine(line);
    if (looksLikeDailyRowByCells(cells)) continue;

    const labelIndex = cells.findIndex(
      (c) => c.trim().toUpperCase() === "TOTAL HOURS"
    );
    if (labelIndex === -1) continue;

    const reg = parseNumberOrNull(cells[labelIndex + 1]);
    const sick = parseNumberOrNull(cells[labelIndex + 2]);
    const ot = parseNumberOrNull(cells[labelIndex + 3]);
    const total = parseNumberOrNull(cells[labelIndex + 4]);

    payrollTotalRegularHours = reg;
    payrollTotalSickHours = sick;
    payrollTotalOvertimeHours = ot;
    payrollTotalHours = total;

    console.log("Detected payroll totals row:", cells);
    console.log("Parsed payroll totals:", {
      payrollTotalRegularHours,
      payrollTotalSickHours,
      payrollTotalOvertimeHours,
      payrollTotalHours
    });

    break;
  }
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const trimmed = timeStr.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const suffix = match[3] ? match[3].toUpperCase() : null;

  if (suffix === "AM" && hours === 12) {
    hours = 0;
  } else if (suffix === "PM" && hours < 12) {
    hours += 12;
  }

  return hours * 60 + minutes;
}

function computeTimeHours(row) {
  const timeInStr = row["TIME IN"];
  const timeOutStr = row["TIME OUT"];
  const lunchStartStr = row["LUNCH START"];
  const lunchEndStr = row["LUNCH END"];

  const inMinutes = parseTimeToMinutes(timeInStr);
  const outMinutes = parseTimeToMinutes(timeOutStr);
  if (inMinutes === null || outMinutes === null) return 0;

  let breakMinutes = 0;
  const lunchStartMinutes = parseTimeToMinutes(lunchStartStr);
  const lunchEndMinutes = parseTimeToMinutes(lunchEndStr);
  if (lunchStartMinutes !== null && lunchEndMinutes !== null) {
    breakMinutes = Math.max(0, lunchEndMinutes - lunchStartMinutes);
  }

  const rawMinutes = outMinutes - inMinutes - breakMinutes;
  if (!Number.isFinite(rawMinutes) || rawMinutes <= 0) return 0;

  return rawMinutes / 60;
}

function formatHours(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return value.toFixed(2);
}

// ---------------------------------------------------------------------------
// Footer detection helper (bottom "TOTAL HOURS" row ONLY)
// ---------------------------------------------------------------------------

function isTotalsFooterRow(row) {
  const dayCell = (row["DAY"] || "").trim().toUpperCase();
  const timeOutCell = (row["TIME OUT"] || "").trim().toUpperCase();

  const dayNames = [
    "MONDAY", "TUESDAY", "WEDNESDAY",
    "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"
  ];

  const isRealDay = dayNames.includes(dayCell);
  const isTotalsLabelInTimeOut = timeOutCell === "TOTAL HOURS";

  // In your CSV, the bottom footer row has TIME OUT = "TOTAL HOURS" and no day name
  return !isRealDay && isTotalsLabelInTimeOut;
}

// ---------------------------------------------------------------------------
// Policy-based evaluation (truth from punches)
// ---------------------------------------------------------------------------

function evaluateAllRows() {
  const dayNames = [
    "MONDAY", "TUESDAY", "WEDNESDAY",
    "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"
  ];
  const dayOrder = {
    "MONDAY": 1,
    "TUESDAY": 2,
    "WEDNESDAY": 3,
    "THURSDAY": 4,
    "FRIDAY": 5,
    "SATURDAY": 6,
    "SUNDAY": 7
  };

  let weekIndex = 1;
  let lastDayOrder = null;
  const dayRowIndices = [];
  const epsilon = 0.01;

  // First pass: per-day truth + validation
  parsedRows.forEach((row, idx) => {
    // Detect the footer "TOTAL HOURS" row and skip normal validation
    if (isTotalsFooterRow(row)) {
      const sickHours = parseNumberOrNull(row["SICK LEAVE"]) || 0;
      const regHours = parseNumberOrNull(row["REGULAR HOURS"]) || 0;
      const otHours  = parseNumberOrNull(row["OVER TIME"]) || 0;
      const totalCell = parseNumberOrNull(row["TOTAL HOURS"]);

      row._eval = {
        isFooter: true,
        timeHours: 0,
        sickHours,
        regHours,
        otHours,
        totalCell,
        computedHours: null,   // don't recompute "truth" for footer
        hasError: false,       // footer never blocks PDF
        errorMessages: [],
        weekIndex: null
      };

      return; // skip normal validation for this row
    }

    const rawDayCell = (row["DAY"] || "").trim();
    const dayName = rawDayCell.toUpperCase();
    const isDay = dayNames.includes(dayName);

    const timeHours = computeTimeHours(row);                 // truth: worked hours
    const sickHours = parseNumberOrNull(row["SICK LEAVE"]) || 0; // truth: as entered
    const regHours = parseNumberOrNull(row["REGULAR HOURS"]) || 0;
    const otHours  = parseNumberOrNull(row["OVER TIME"]) || 0;
    const totalCell = parseNumberOrNull(row["TOTAL HOURS"]);

    const computedHours = timeHours + sickHours; // truth total per day
    let hasError = false;
    const errorMessages = [];

    // Assign week index for DAY rows
    let thisWeekIndex = null;
    if (isDay) {
      const order = dayOrder[dayName];
      if (lastDayOrder !== null && order < lastDayOrder) {
        weekIndex += 1; // wrap -> new week
      }
      lastDayOrder = order;
      thisWeekIndex = weekIndex;
      dayRowIndices.push(idx);
    }

    const hasPunches = timeHours > 0;

    // 1) TOTAL HOURS vs our truth (punches + sick)
    if (totalCell !== null) {
      if (Math.abs(totalCell - computedHours) > epsilon) {
        hasError = true;
        errorMessages.push(
          `Total hours (${formatHours(totalCell)}) do not match punches + sick (${formatHours(computedHours)}).`
        );
      }
    }

    // 2) REGULAR HOURS vs punched time
    if (hasPunches) {
      if (Math.abs(regHours - timeHours) > epsilon) {
        hasError = true;
        errorMessages.push(
          `Regular hours (${formatHours(regHours)}) do not match punched time (${formatHours(timeHours)}).`
        );
      }
    } else {
      // No punches
      if (regHours > 0 || otHours > 0) {
        hasError = true;
        errorMessages.push("No punches for this day, but regular and/or overtime hours were entered.");
      }
    }

    // 3) Sick-only day sanity
    if (!hasPunches && sickHours > 0) {
      if (regHours > 0 || otHours > 0) {
        hasError = true;
        errorMessages.push("Pure sick day should not have regular or overtime hours.");
      }
      if (sickHours > 8 + epsilon) {
        hasError = true;
        errorMessages.push("Sick day cannot exceed 8 hours.");
      }
    }

    // 4) Policy-specific rules
    if (employeePolicy === "DAILY_OT") {
      const daily = evaluateDailyOTPolicy({ timeHours, sickHours, regHours, otHours });
      if (daily.errorMessages.length > 0) {
        hasError = true;
        errorMessages.push(...daily.errorMessages);
      }
    } else {
      const weeklyDaily = evaluateWeeklyPolicyDaily({ timeHours, sickHours, regHours, otHours });
      if (weeklyDaily.errorMessages.length > 0) {
        hasError = true;
        errorMessages.push(...weeklyDaily.errorMessages);
      }
    }

    row._eval = {
      timeHours,
      sickHours,
      regHours,
      otHours,
      totalCell,
      computedHours,
      hasError,
      errorMessages,
      weekIndex: thisWeekIndex
    };
  });

  // Second pass: weekly OT checks (weekly OT policy employees)
  if (employeePolicy === "WEEKLY_OT" && dayRowIndices.length > 0) {
    applyWeeklyOTChecks(dayRowIndices);
  }
}

// DAILY OT rules for Lu
function evaluateDailyOTPolicy({ timeHours, sickHours, regHours, otHours }) {
  const errorMessages = [];
  const epsilon = 0.01;
  const hasPunches = timeHours > 0;

  if (hasPunches) {
    // OT + sick not allowed
    if (otHours > 0 && sickHours > 0) {
      errorMessages.push("Daily-OT policy: sick time cannot be combined with overtime.");
    }

    if (sickHours > 0) {
      // Partial sick + work: worked + sick cannot exceed 8
      if (timeHours + sickHours > 8 + epsilon) {
        errorMessages.push("Daily-OT policy: worked hours + sick exceed 8 hours in one day.");
      }
      // No overtime allowed on these days
      if (otHours > 0) {
        errorMessages.push("Daily-OT policy: overtime not allowed on days with sick time.");
      }
    } else {
      // No sick; check OT vs >8 rule
      if (timeHours <= 8 + epsilon && otHours > 0) {
        errorMessages.push("Daily-OT policy: overtime present but worked hours are 8 or less.");
      }
      if (timeHours > 8 + epsilon) {
        const expectedReg = 8;
        const expectedOT = timeHours - 8;
        if (Math.abs(regHours - expectedReg) > epsilon || Math.abs(otHours - expectedOT) > epsilon) {
          errorMessages.push(
            `Daily-OT policy: expected 8.00 regular and ${formatHours(expectedOT)} overtime based on punches.`
          );
        }
      }
    }
  } else {
    // No punches, pure sick handled above; OT meaningless here
    if (otHours > 0) {
      errorMessages.push("Daily-OT policy: no punches, overtime should not be entered.");
    }
  }

  return { errorMessages };
}

// Light daily checks for weekly OT employees (weekly logic comes later)
function evaluateWeeklyPolicyDaily({ timeHours, sickHours, regHours, otHours }) {
  const errorMessages = [];
  const epsilon = 0.01;
  const hasPunches = timeHours > 0;

  if (hasPunches) {
    if (timeHours <= epsilon && otHours > 0) {
      errorMessages.push("Overtime is entered but there are no worked hours for this day.");
    }
  } else {
    if (otHours > 0) {
      errorMessages.push("No punches for this day, but overtime hours were entered.");
    }
  }

  return { errorMessages };
}

// Weekly OT checks (weekly OT policy employees)
function applyWeeklyOTChecks(dayRowIndices) {
  const weeks = new Map(); // weekIndex -> { workedHours, sickHours, otHours, rowIndices }

  dayRowIndices.forEach((idx) => {
    const row = parsedRows[idx];
    const ev = row._eval;
    const w = ev.weekIndex;
    if (w == null) return;

    if (!weeks.has(w)) {
      weeks.set(w, {
        workedHours: 0,
        sickHours: 0,
        otHours: 0,
        rowIndices: []
      });
    }

    const bucket = weeks.get(w);
    bucket.workedHours += ev.timeHours;
    bucket.sickHours += ev.sickHours;
    bucket.otHours += ev.otHours;
    bucket.rowIndices.push(idx);
  });

  const epsilon = 0.01;

  for (const [weekIndex, bucket] of weeks.entries()) {
    const { workedHours, sickHours, otHours, rowIndices } = bucket;

    let expectedOT = 0;
    if (sickHours > 0) {
      // Sick in week => no OT allowed
      expectedOT = 0;
    } else {
      // No sick => OT only for worked > 40
      expectedOT = Math.max(workedHours - 40, 0);
    }

    if (Math.abs(otHours - expectedOT) > epsilon) {
      const msg = sickHours > 0
        ? `Weekly OT rule: week ${weekIndex} has sick time (${formatHours(sickHours)}h), so overtime should be 0 (found ${formatHours(otHours)}).`
        : `Weekly OT rule: week ${weekIndex} worked = ${formatHours(workedHours)}h, expected overtime = ${formatHours(expectedOT)} but found ${formatHours(otHours)}.`;

      const rowsToFlag = otHours > 0
        ? rowIndices.filter(i => parsedRows[i]._eval.otHours > 0)
        : rowIndices;

      rowsToFlag.forEach((rowIdx) => {
        const ev = parsedRows[rowIdx]._eval;
        ev.hasError = true;
        ev.errorMessages.push(msg);
      });
    } else {
      console.log(`Week ${weekIndex} weekly OT matches expectations.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Weekly summary builder
// ---------------------------------------------------------------------------

function buildWeeklySummary() {
  const weeks = new Map(); // weekIndex -> summary bucket

  parsedRows.forEach((row) => {
    const ev = row._eval;
    if (!ev || ev.isFooter || ev.weekIndex == null) return; // skip non-day + footer

    const w = ev.weekIndex;
    if (!weeks.has(w)) {
      weeks.set(w, {
        weekIndex: w,
        workedHours: 0,
        sickHours: 0,
        regHours: 0,
        otHours: 0,
        hasErrors: false,
      });
    }

    const bucket = weeks.get(w);
    bucket.workedHours += ev.timeHours || 0;
    bucket.sickHours += ev.sickHours || 0;
    bucket.regHours += ev.regHours || 0;
    bucket.otHours += ev.otHours || 0;
    if (ev.hasError) {
      bucket.hasErrors = true;
    }
  });

  const summaryArray = Array.from(weeks.values());
  summaryArray.sort((a, b) => a.weekIndex - b.weekIndex);
  return summaryArray;
}

function buildWeeklySummaryHtml() {
  const summary = buildWeeklySummary();
  if (!summary.length) {
    return "";
  }

  let html = `
    <h3>Weekly Summary</h3>
    <p>
      This table summarizes worked, sick, and overtime hours per week, based on punches and entered sick time.
      Rows marked with ⚠️ have at least one day with rule errors.
    </p>
    <table class="weekly-summary-table">
      <thead>
        <tr>
          <th>Week #</th>
          <th>Worked Hours (punches)</th>
          <th>Sick Hours</th>
          <th>Regular Hours (entered)</th>
          <th>Overtime Hours (entered)</th>
          <th>Flags</th>
        </tr>
      </thead>
      <tbody>
  `;

  summary.forEach((w) => {
    const flagText = w.hasErrors ? "⚠️ Check details below" : "";
    html += `
      <tr>
        <td>Week ${w.weekIndex}</td>
        <td>${formatHours(w.workedHours)}</td>
        <td>${formatHours(w.sickHours)}</td>
        <td>${formatHours(w.regHours)}</td>
        <td>${formatHours(w.otHours)}</td>
        <td>${flagText}</td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  return html;
}

// ---------------------------------------------------------------------------
// Print / PDF helpers
// ---------------------------------------------------------------------------

function updatePdfButtonState() {
  const hasAnyError = parsedRows.some((r) => r._eval && r._eval.hasError);
  downloadPdfBtn.disabled = hasAnyError;
  downloadPdfBtn.title = hasAnyError
    ? "PDF disabled — fix errors first."
    : "Generate printable PDF.";
}

// Fills #printArea elements before calling window.print()
// We support two modes:
// - New structure: pOriginalTable + pReportSummary + pReportTable
// - Fallback: older pWeeklySummary + pTable (if you already added those)
function populatePrintView() {
  const pEmployee = document.getElementById("pEmployee");
  const pBegin = document.getElementById("pBegin");
  const pEnd = document.getElementById("pEnd");
  const pPayDate = document.getElementById("pPayDate");

  if (pEmployee) pEmployee.textContent = employeeName || "";
  if (pBegin) pBegin.textContent = payBeginDate || "";
  if (pEnd) pEnd.textContent = payEndDate || "";
  if (pPayDate) pPayDate.textContent = payDate || "";

  const pOriginalTable = document.getElementById("pOriginalTable");
  const pReportSummary = document.getElementById("pReportSummary");
  const pReportTable = document.getElementById("pReportTable");

  const pWeeklySummary = document.getElementById("pWeeklySummary");
  const pTable = document.getElementById("pTable");

  // --- NEW: "Original" timecard layout (no computed / no rule error) ------
  if (pOriginalTable) {
    let origHtml = "<table><thead><tr>";
    headerRow.forEach(h => {
      origHtml += `<th>${h}</th>`;
    });
    origHtml += "</tr></thead><tbody>";

    parsedRows.forEach(row => {
      origHtml += "<tr>";
      headerRow.forEach(h => {
        const key = h.trim().toUpperCase();
        origHtml += `<td>${row[key] || ""}</td>`;
      });
      origHtml += "</tr>";
    });

    origHtml += "</tbody></table>";
    pOriginalTable.innerHTML = origHtml;
  }

  // --- Report summary (weekly summary) ------------------------------------
  const weekly = buildWeeklySummary();
  const summaryHtml = (() => {
    if (!weekly.length) return "";
    let wsHtml = "<table><thead><tr><th>Week</th><th>Worked</th><th>Sick</th><th>Regular</th><th>OT</th></tr></thead><tbody>";
    weekly.forEach(w => {
      wsHtml += `
        <tr>
          <td>${w.weekIndex}</td>
          <td>${formatHours(w.workedHours)}</td>
          <td>${formatHours(w.sickHours)}</td>
          <td>${formatHours(w.regHours)}</td>
          <td>${formatHours(w.otHours)}</td>
        </tr>`;
    });
    wsHtml += "</tbody></table>";
    return wsHtml;
  })();

  if (pReportSummary) {
    pReportSummary.innerHTML = summaryHtml;
  } else if (pWeeklySummary) {
    // fallback to older id if used
    pWeeklySummary.innerHTML = summaryHtml;
  }

  // --- Detailed report table (with computed + rule error) -----------------
  const reportTableHtml = (() => {
    let tHtml = "<table><thead><tr>";
    headerRow.forEach(h => tHtml += `<th>${h}</th>`);
    tHtml += `<th>Computed Hours</th>`;
    tHtml += `<th>Rule Error</th>`;
    tHtml += `</tr></thead><tbody>`;

    parsedRows.forEach(row => {
      const ev = row._eval || {};
      tHtml += "<tr>";
      headerRow.forEach(h => {
        const key = h.trim().toUpperCase();
        tHtml += `<td>${row[key] || ""}</td>`;
      });
      const displayWorked =
        ev.computedHours === null || ev.computedHours === undefined
          ? "—"
          : ev.computedHours.toFixed(2);
      const errorText = ev.hasError ? ev.errorMessages.join(" | ") : "";
      tHtml += `<td>${displayWorked}</td>`;
      tHtml += `<td>${errorText}</td>`;
      tHtml += "</tr>";
    });

    tHtml += "</tbody></table>";
    return tHtml;
  })();

  if (pReportTable) {
    pReportTable.innerHTML = reportTableHtml;
  } else if (pTable) {
    // fallback to older id if used
    pTable.innerHTML = reportTableHtml;
  }
}

// ---------------------------------------------------------------------------
// Preview rendering (full table)
// ---------------------------------------------------------------------------

function showPreviewResults() {
  evaluateAllRows();

  summaryCard.hidden = false;
  tableCard.hidden = false;
  downloadCard.hidden = true; // only show PDF if no errors (we'll toggle below)

  const numRows = parsedRows.length;

  const metaHtml = `
    <p>
      <strong>Employee:</strong> ${employeeName || "(not found)"}<br />
      <strong>Policy:</strong> ${employeePolicy}<br />
      <strong>Pay Begin:</strong> ${payBeginDate || "(n/a)"} &nbsp; | &nbsp;
      <strong>Pay End:</strong> ${payEndDate || "(n/a)"} &nbsp; | &nbsp;
      <strong>Pay Date:</strong> ${payDate || "(n/a)"}
    </p>
  `;

  const payrollTotalsHtml = `
    <p>
      <strong>Payroll Totals (from sheet):</strong><br />
      Regular: ${formatHours(payrollTotalRegularHours)} &nbsp; | &nbsp;
      Sick: ${formatHours(payrollTotalSickHours)} &nbsp; | &nbsp;
      OT: ${formatHours(payrollTotalOvertimeHours)} &nbsp; | &nbsp;
      Total: ${formatHours(payrollTotalHours)}
    </p>
  `;

  const weeklySummaryHtml = buildWeeklySummaryHtml();

  summaryContent.innerHTML = `
    ${metaHtml}
    ${payrollTotalsHtml}
    ${weeklySummaryHtml}
    <p><strong>CSV parsed and evaluated against punches.</strong></p>
    <p>Data rows (up to TOTAL HOURS footer): <strong>${numRows}</strong></p>
    <p>The table below shows the entire timecard.<br/>
       <strong>Computed Hours</strong> = punches (worked) + sick.<br/>
       <strong>Rule Error</strong> explains exactly what doesn't match our calculations or policy.</p>
  `;

  if (numRows > 0) {
    let tableHtml = "<table><thead><tr>";
    headerRow.forEach((col) => {
      tableHtml += `<th>${col}</th>`;
    });
    tableHtml += `<th>Computed Hours</th>`;
    tableHtml += `<th>Rule Error</th>`;
    tableHtml += "</tr></thead><tbody>";

    parsedRows.forEach((row) => {
      const ev = row._eval || {};

      tableHtml += "<tr>";
      headerRow.forEach((col) => {
        const key = col.trim().toUpperCase();
        tableHtml += `<td>${row[key] || ""}</td>`;
      });

      const displayWorked =
        ev.computedHours === null || ev.computedHours === undefined
          ? "—"
          : ev.computedHours.toFixed(2);

      const errorText = ev.hasError
        ? ev.errorMessages.join(" | ")
        : "";

      tableHtml += `<td>${displayWorked}</td>`;
      tableHtml += `<td>${errorText}</td>`;
      tableHtml += `</tr>`;
    });

    tableHtml += "</tbody></table>";
    tableContainer.innerHTML = tableHtml;
  } else {
    tableContainer.innerHTML = "<p>No data rows found under the header.</p>";
  }

  // Update print view + PDF button state
  populatePrintView();
  updatePdfButtonState();

  // Only show the download card if PDF is allowed (no errors)
  if (!parsedRows.some((r) => r._eval && r._eval.hasError)) {
    downloadCard.hidden = false;
  }
}
