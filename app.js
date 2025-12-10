// app.js
// This is like main.py in Python: our main logic entrypoint.

// We'll store the parsed data here later
let rawCsvText = "";
let parsedRows = [];
let cleanedRows = [];
// Grab elements from the page
const fileInput = document.getElementById("fileInput");
const runCheckBtn = document.getElementById("runCheckBtn");
const summaryCard = document.getElementById("summaryCard");
const summaryContent = document.getElementById("summaryContent");
const tableCard = document.getElementById("tableCard");
const tableContainer = document.getElementById("tableContainer");
const downloadCard = document.getElementById("downloadCard");
const downloadCsvBtn = document.getElementById("downloadCsvBtn");
const downloadPdfBtn = document.getElementById("downloadPdfBtn");

// Enable the Run button once a file is selected
fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files.length > 0) {
    runCheckBtn.disabled = false;
  } else {
    runCheckBtn.disabled = true;
  }
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
    console.log("CSV loaded, length:", rawCsvText.length);

    // TODO: parse CSV, remove metadata, calculate hours, etc.
    // For now, just show a placeholder.
    showPlaceholderResults();
  };

  reader.onerror = () => {
    alert("Error reading file. Please try again.");
  };

  reader.readAsText(file);
});

// Temporary placeholder while we build the real logic
function showPlaceholderResults() {
  summaryCard.hidden = false;
  tableCard.hidden = false;
  downloadCard.hidden = true; // we'll enable later

  summaryContent.innerHTML = `
    <p><strong>File loaded.</strong> Next step: implement CSV parsing & calculations.</p>
    <p>CSV length: ${rawCsvText.length} characters</p>
  `;

  tableContainer.innerHTML = `
    <p>This is where the reconstructed timecard table will appear.</p>
  `;
}
