import Chart from 'chart.js/auto';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// --- Constants & Config ---
const DRUG_OPTIONS = [
    'Acepromazine', 'Alfaxalone', 'Atipamazole', 'Atropine', 'Buprenorphine',
    'Butorphanol', 'Cefazolin', 'Dexmedetomidine', 'Diazepam', 'Dobutamine',
    'Dopamine', 'Epinephrine', 'Fentanyl', 'Flumazenil',
    'Glycopyrrolate', 'Ketamine', 'Lidocaine', 'Maropitant', 'Meloxicam',
    'Methadone', 'Midazolam', 'Morphine', 'Naloxone', 'Propofol',
    'Zolazepam/Tiletamine (Zoletil)'
].sort();

const EPIDURAL_OPTIONS = ['Lidocaine', 'Bupivacaine', 'Ropivacaine'];

const IVC_SITES = ['18G', '19G', '20G', '21G', '22G', '23G', '24G', '25G'];

const ROUTE_OPTIONS = ['IV', 'IM', 'SC'];
const DOSE_UNITS = ['mg/kg', 'mcg/kg', 'mg/m^2', 'mcg/m^2', 'mg/animal', 'mcg/animal'];

const FIELD_IDS = [
    'pet-name', 'animal-id', 'breed', 'date', 'weight', 'sex', 'anesthetist', 'surgeon', 'procedure',
    'procedure-note', 'et-tube-size', 'intubation-time', 'extubation-time', 'ivc-site', 'bp-cuff-size',
    'age-y', 'age-m', 'setup-ventilator', 'setup-mask'
];

const MIN_CHART_SLOTS = 20;

// --- State Management ---
let chart;
const vitalsData = {
    times: [],
    systolic: [],
    diastolic: [],
    mean: [],
    pulse: [],
    etco2: [],
    spo2: [],
    spo2: [],
    bt: [],
    iso: [],
    rr: [],
    fluids: [] // Array of objects: [{name: 'fluid1', rate: 100}, ...]
};

// --- Timer State ---
let timerInterval = null;
let timerStartTime = null;
let timerElapsedTime = 0;
let isTimerRunning = false;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    populateSelects();
    initChart();
    updateTime();
    setInterval(updateTime, 1000);

    // Event Listeners
    document.getElementById('add-drug').addEventListener('click', (e) => {
        e.preventDefault(); // Prevent details from flashing
        addDrugRow();
    });
    document.getElementById('add-fluid').addEventListener('click', (e) => {
        e.preventDefault();
        addFluidRow();
    });
    document.getElementById('add-epidural').addEventListener('click', (e) => {
        e.preventDefault();
        addEpiduralRow();
    });

    // Timer Controls
    const btnStart = document.getElementById('btn-start-case');
    const btnEnd = document.getElementById('btn-end-case');
    if (btnStart) btnStart.addEventListener('click', startTimer);
    if (btnEnd) btnEnd.addEventListener('click', stopTimer);

    // Initial Load
    loadFromLocal();
    loadTimerState();
    document.getElementById('log-vitals').addEventListener('click', (e) => {
        e.stopPropagation();
        logVitals();
    });
}); // End DOMContentLoaded

// --- Modal Helper ---
function showModal(title, content, onConfirm, showInput = false, inputValue = '') {
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';

    let inputHtml = '';
    if (showInput) {
        inputHtml = `<input type="number" id="modal-input" value="${inputValue}" step="any">`;
    }

    overlay.innerHTML = `
        <div class="custom-modal">
            <h3>${title}</h3>
            ${content ? `<p style="margin-bottom:15px;">${content}</p>` : ''}
            ${inputHtml}
            <div class="custom-modal-actions">
                <button class="modal-btn confirm" id="modal-confirm">Confirm</button>
                <button class="modal-btn cancel" id="modal-cancel">Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const input = document.getElementById('modal-input');
    if (input) input.focus();

    const close = () => {
        document.body.removeChild(overlay);
    };

    document.getElementById('modal-confirm').addEventListener('click', () => {
        const val = input ? input.value : null;
        if (showInput && (val === null || val.trim() === '')) {
            alert('Please enter a value');
            return;
        }
        onConfirm(val);
        close();
    });

    document.getElementById('modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Date
    document.getElementById('date').valueAsDate = new Date();

    // 2. Populate Selects
    populateSelects();

    // 3. Initialize Chart
    initChart();

    // 4. Load Data
    loadFromLocal();

    // 5. Global Event Listeners
    document.getElementById('log-vitals').addEventListener('click', logVitals);



    document.getElementById('export-json').addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(saveToLocal(true)));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `anesthesia_record_${getSafeDateString()}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });

    document.getElementById('export-pdf').addEventListener('click', async () => {
        const doc = new jsPDF('p', 'mm', 'a4');
        const sections = document.querySelectorAll('.card');
        let yOffset = 10;

        // Hide buttons for screenshot
        document.querySelectorAll('button, .header-actions, .actions').forEach(el => el.style.display = 'none');

        const title = 'Anesthesia Monitoring Record';
        doc.setFontSize(16);
        doc.text(title, 105, yOffset, { align: 'center' });
        yOffset += 10;

        for (const section of sections) {
            // Ensure details are open
            const wasOpen = section.hasAttribute('open');
            section.setAttribute('open', '');

            await html2canvas(section, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' }).then(canvas => {
                const imgData = canvas.toDataURL('image/png');
                const imgWidth = 190;
                const pageHeight = 295;
                const imgHeight = canvas.height * imgWidth / canvas.width;

                if (yOffset + imgHeight > pageHeight - 10) {
                    doc.addPage();
                    yOffset = 10;
                }

                doc.addImage(imgData, 'PNG', 10, yOffset, imgWidth, imgHeight);
                yOffset += imgHeight + 5;
            });

            if (!wasOpen) section.removeAttribute('open');
        }

        // Restore buttons
        document.querySelectorAll('button, .header-actions, .actions').forEach(el => el.style.display = '');

        doc.save(`anesthesia_record_${getSafeDateString()}.pdf`);
    });
});
function getSafeDateString() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}_${hh}-${min}`;
}

document.getElementById('export-json').addEventListener('click', () => {
    saveToLocal();
    const saved = localStorage.getItem('anesthesia_data');
    if (saved && saved !== '{}') {
        const blob = new Blob([saved], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `anesthesia_record_${getSafeDateString()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } else {
        alert('No data to export.');
    }
});

document.getElementById('export-pdf').addEventListener('click', async () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const sections = document.querySelectorAll('.card');
    let yOffset = 10;

    // Hide buttons for screenshot
    document.querySelectorAll('button, .header-actions, .actions').forEach(el => el.style.display = 'none');

    const title = 'Anesthesia Monitoring Record';
    doc.setFontSize(16);
    doc.text(title, 105, yOffset, { align: 'center' });
    yOffset += 10;

    for (const section of sections) {
        // Ensure details are open
        const wasOpen = section.hasAttribute('open');
        section.setAttribute('open', '');

        await html2canvas(section, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const imgWidth = 190;
            const pageHeight = 295;
            const imgHeight = canvas.height * imgWidth / canvas.width;

            if (yOffset + imgHeight > pageHeight - 10) {
                doc.addPage();
                yOffset = 10;
            }

            doc.addImage(imgData, 'PNG', 10, yOffset, imgWidth, imgHeight);
            yOffset += imgHeight + 5;
        });

        if (!wasOpen) section.removeAttribute('open');
    }

    // Restore buttons
    document.querySelectorAll('button, .header-actions, .actions').forEach(el => el.style.display = '');

    doc.save(`anesthesia_record_${getSafeDateString()}.pdf`);
});
document.getElementById('clear-data').addEventListener('click', () => {
    showModal(
        'Clear All Data?',
        'This will permanently delete all logged data.',
        () => {
            localStorage.removeItem('anesthesia_data');
            localStorage.removeItem('anesthesia_timer');
            location.reload();
        }
    );
});

document.getElementById('cancel-clear').addEventListener('click', () => {
    document.getElementById('confirm-modal').close();
});

document.getElementById('confirm-clear').addEventListener('click', () => {
    localStorage.removeItem('anesthesia_data');
    location.reload();
});

// ... existing helpers ...
// --- Delegated Table Listeners (Sync & Delete) ---
const tbody = document.querySelector('#vitals-history tbody');
if (tbody) {
    tbody.addEventListener('change', (e) => {
        const index = parseInt(e.target.getAttribute('data-index'));
        const val = e.target.value === '' ? null : parseFloat(e.target.value);

        if (e.target.classList.contains('vital-edit')) {
            const field = e.target.getAttribute('data-field');
            if (field) {
                vitalsData[field][index] = val;

                // Recalculate Mean if Sys/Dia changed
                if (field === 'systolic' || field === 'diastolic') {
                    const s = vitalsData.systolic[index];
                    const d = vitalsData.diastolic[index];
                    if (s !== null && d !== null) {
                        vitalsData.mean[index] = Math.round(d + (s - d) / 3);
                    } else {
                        vitalsData.mean[index] = null;
                    }
                    updateVitalsHistoryTable();
                }
                refreshChart();
                saveToLocal();
            }
        } else if (e.target.classList.contains('vital-edit-fluid')) {
            const name = e.target.getAttribute('data-fluid-name');
            if (!vitalsData.fluids[index]) vitalsData.fluids[index] = {};

            if (val === null) {
                delete vitalsData.fluids[index][name];
            } else {
                vitalsData.fluids[index][name] = val;
            }

            rebuildFluidDatasets();
            refreshChart();
            saveToLocal();
        }
    });

    tbody.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-vital-btn')) {
            e.stopPropagation();
            e.preventDefault();
            const index = parseInt(e.target.getAttribute('data-index'));

            showModal(
                'Delete this record?',
                'Are you sure you want to delete this vital sign entry?',
                () => {
                    // Remove data at index for all arrays
                    vitalsData.times.splice(index, 1);
                    vitalsData.systolic.splice(index, 1);
                    vitalsData.diastolic.splice(index, 1);
                    vitalsData.mean.splice(index, 1);
                    vitalsData.pulse.splice(index, 1);
                    vitalsData.spo2.splice(index, 1);
                    vitalsData.etco2.splice(index, 1);
                    vitalsData.bt.splice(index, 1);
                    vitalsData.rr.splice(index, 1);
                    vitalsData.iso.splice(index, 1);
                    vitalsData.fluids.splice(index, 1);

                    // Re-sync Fluid Datasets
                    chart.data.datasets.forEach(ds => {
                        ds.data.splice(index, 1);
                    });

                    updateVitalsHistoryTable();
                    refreshChart();
                    saveToLocal();
                }
            );
        }
    });
}


// ... existing helpers ...

function exportData() {
    saveToLocal(); // Save current state first
    const saved = localStorage.getItem('anesthesia_data');
    if (saved && saved !== '{}') {
        const blob = new Blob([saved], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `anesthesia_record_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a); // Append to body to ensure click works
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } else {
        alert('No data to export.');
    }
}

async function exportPDF() {
    const doc = new jsPDF('p', 'mm', 'a4');
    const sections = document.querySelectorAll('.card');
    let yOffset = 10;

    // Temporarily hide buttons and apply print styles
    const buttons = document.querySelectorAll('button, .header-actions, .actions');
    buttons.forEach(el => el.style.display = 'none');

    const title = 'Anesthesia Monitoring Record';
    doc.setFontSize(16);
    doc.text(title, 105, yOffset, { align: 'center' });
    yOffset += 10;

    for (const section of sections) {
        // Ensure details are open for capture
        const wasOpen = section.hasAttribute('open');
        section.setAttribute('open', '');

        // Use white background to prevent transparent/black PDF issues
        await html2canvas(section, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff'
        }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const imgWidth = 190;
            const pageHeight = 295;
            const imgHeight = canvas.height * imgWidth / canvas.width;

            if (yOffset + imgHeight > pageHeight - 10) {
                doc.addPage();
                yOffset = 10;
            }

            doc.addImage(imgData, 'PNG', 10, yOffset, imgWidth, imgHeight);
            yOffset += imgHeight + 5;
        }).catch(err => console.error('Canvas error:', err));

        if (!wasOpen) section.removeAttribute('open');
    }

    // Restore buttons
    buttons.forEach(el => el.style.display = '');

    doc.save(`anesthesia_record_${new Date().toISOString().split('T')[0]}.pdf`);
}
document.addEventListener('change', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
        saveToLocal();
    }
});

// Weight change updates all dose calculations
document.getElementById('weight').addEventListener('input', updateAllDrugTotals);

loadFromLocal();


function populateSelects() {
    // Age Y: 0-25
    const ageY = document.getElementById('age-y');
    for (let i = 0; i <= 25; i++) {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = i;
        ageY.appendChild(opt);
    }
    // Age M: 0-12
    const ageM = document.getElementById('age-m');
    for (let i = 0; i <= 12; i++) {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = i;
        ageM.appendChild(opt);
    }
    // ET Tube: none, 2.5 - 15 (0.5 steps)
    const etSize = document.getElementById('et-tube-size');
    const noneOpt = document.createElement('option');
    noneOpt.value = 'none'; noneOpt.textContent = 'none';
    etSize.appendChild(noneOpt);
    for (let i = 2.5; i <= 15; i += 0.5) {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = i;
        etSize.appendChild(opt);
    }
    // IVC Site
    const ivcSite = document.getElementById('ivc-site');
    ivcSite.innerHTML = '<option value="">Select Size</option>';
    IVC_SITES.forEach(site => {
        const opt = document.createElement('option');
        opt.value = site; opt.textContent = site;
        ivcSite.appendChild(opt);
    });
}

// --- Chart Logic ---
function initChart() {
    const ctx = document.getElementById('vitalChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: getChartLabels(),
            datasets: [
                { label: 'SYS', data: vitalsData.systolic, borderColor: '#ff6384', pointStyle: 'triangle', rotation: 180, borderWidth: 2, tension: 0.1, spanGaps: true, yAxisID: 'y' },
                { label: 'DIA', data: vitalsData.diastolic, borderColor: '#36a2eb', pointStyle: 'triangle', borderWidth: 2, tension: 0.1, spanGaps: true, yAxisID: 'y' },
                { label: 'MEAN', data: vitalsData.mean, borderColor: '#ffffff', pointStyle: 'rectRot', borderWidth: 1, borderDash: [5, 5], tension: 0.1, spanGaps: true, yAxisID: 'y' },
                { label: 'PULSE', data: vitalsData.pulse, borderColor: '#f1c40f', pointStyle: 'circle', borderWidth: 2, tension: 0.1, spanGaps: true, yAxisID: 'y' },
                { label: 'SpO2', data: vitalsData.spo2, borderColor: '#2ecc71', pointStyle: 'star', borderWidth: 2, tension: 0.1, spanGaps: true, yAxisID: 'y' },
                { label: 'ETCO2', data: vitalsData.etco2, borderColor: '#9b59b6', pointStyle: 'crossRot', borderWidth: 2, tension: 0.1, spanGaps: true, yAxisID: 'y' },
                { label: 'BT', data: vitalsData.bt, borderColor: '#34495e', pointStyle: 'rect', borderWidth: 2, tension: 0.1, spanGaps: true, yAxisID: 'y' },
                { label: 'RR', data: vitalsData.rr, borderColor: '#00bcd4', pointStyle: 'cross', borderWidth: 2, tension: 0.1, spanGaps: true, yAxisID: 'y' },
                { label: 'ISO', data: vitalsData.iso, borderColor: '#e67e22', pointStyle: 'circle', borderWidth: 2, tension: 0.1, spanGaps: true, yAxisID: 'yIso', borderDash: [2, 2] }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    position: 'left',
                    min: 0,
                    max: 200,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#8b949e',
                        stepSize: 20,
                        padding: 10
                    },
                    title: { display: true, text: 'Vitals', color: '#8b949e' }
                },
                yFluid: {
                    position: 'right',
                    min: 0,
                    max: 50, // Default max 50 as requested
                    grid: { display: false },
                    ticks: {
                        color: '#8b949e',
                        stepSize: 5,
                        padding: 10
                    },
                    title: { display: true, text: 'Fluid Rate (ml/hr)', color: '#8b949e' }
                },
                yIso: {
                    position: 'right',
                    min: 0,
                    max: 5,
                    grid: { display: false },
                    ticks: {
                        color: '#e67e22',
                        stepSize: 0.5
                    },
                    title: { display: true, text: 'ISO %', color: '#e67e22' }
                },
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#8b949e' }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    onClick: null, // Disable legend click (no strike-through)
                    labels: {
                        color: '#000000',
                        usePointStyle: true,
                        padding: 20,
                        font: { size: 12, weight: 'bold' },
                        boxWidth: 10, // Adjust for alignment
                        boxHeight: 10
                    }
                },
                tooltip: {
                    intersect: false,
                    mode: 'index',
                }
            },
            onClick: (e) => {
                const points = chart.getElementsAtEventForMode(e, 'nearest', { intersect: false, axis: 'x' }, true);
                if (points.length) {
                    const firstPoint = points[0];
                    const datasetIndex = firstPoint.datasetIndex;
                    const index = firstPoint.index;

                    // Prevent editing padded empty slots
                    if (!vitalsData.times[index]) return;

                    const label = chart.data.datasets[datasetIndex].label;
                    const currentValue = chart.data.datasets[datasetIndex].data[index];

                    showModal(
                        `Edit ${label} at ${vitalsData.times[index]}`,
                        '',
                        (newValue) => {
                            const val = parseFloat(newValue);
                            if (isNaN(val)) return;

                            // Identify field
                            // Datasets: 0:SYS, 1:DIA, 2:MEAN, 3:PULSE, 4:SpO2, 5:ETCO2, 6:BT, 7+:Fluid
                            if (datasetIndex === 0) vitalsData.systolic[index] = val;
                            else if (datasetIndex === 1) vitalsData.diastolic[index] = val;
                            else if (datasetIndex === 3) vitalsData.pulse[index] = val;
                            else if (datasetIndex === 4) vitalsData.spo2[index] = val;
                            else if (datasetIndex === 5) vitalsData.etco2[index] = val;
                            else if (datasetIndex === 6) vitalsData.bt[index] = val;
                            else if (datasetIndex === 7) vitalsData.rr[index] = val;
                            else if (datasetIndex === 8) vitalsData.iso[index] = val;
                            else if (datasetIndex >= 9) {
                                // If array element is null/undefined, create object
                                if (!vitalsData.fluids[index]) {
                                    vitalsData.fluids[index] = { name: label, rate: val };
                                } else {
                                    // If name matches or it's just the only fluid slot, update it
                                    // Logic: we only support 1 fluid per time slot currently in UI structure?
                                    // Yes, via logFluidPulse pushed one object.
                                    // If user edits a fluid point, we update that object.
                                    vitalsData.fluids[index].name = label; // Ensure name matches
                                    vitalsData.fluids[index].rate = val;
                                }
                            }

                            // Recalc mean
                            if (datasetIndex === 0 || datasetIndex === 1) {
                                const s = vitalsData.systolic[index];
                                const d = vitalsData.diastolic[index];
                                if (s !== null && d !== null) vitalsData.mean[index] = Math.round(d + (s - d) / 3);
                                else vitalsData.mean[index] = null;
                            }

                            updateVitalsHistoryTable();

                            // Update chart data references directly
                            chart.data.datasets[0].data = vitalsData.systolic;
                            chart.data.datasets[1].data = vitalsData.diastolic;
                            chart.data.datasets[2].data = vitalsData.mean;
                            chart.data.datasets[3].data = vitalsData.pulse;
                            chart.data.datasets[4].data = vitalsData.spo2;
                            chart.data.datasets[5].data = vitalsData.etco2;
                            chart.data.datasets[6].data = vitalsData.bt;
                            chart.data.datasets[7].data = vitalsData.iso;

                            // Update fluid dataset
                            chart.data.datasets[datasetIndex].data[index] = val;

                            chart.update();
                            saveToLocal();
                        },
                        true, // showInput
                        currentValue !== null ? currentValue : ''
                    );
                }
            }
        }
    });
}

function logVitals() {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' });

    const sys = document.getElementById('input-sys').value;
    const dia = document.getElementById('input-dia').value;
    const pulse = document.getElementById('input-pulse').value;
    const spo2 = document.getElementById('input-spo2').value;
    const etco2 = document.getElementById('input-etco2').value;
    const bt = document.getElementById('input-bt').value;
    const rr = document.getElementById('input-rr').value;
    const iso = document.getElementById('input-iso').value;

    if (sys || dia || pulse || spo2 || etco2 || bt || rr || iso) {
        const lastIndex = vitalsData.times.length - 1;
        const lastTime = lastIndex >= 0 ? vitalsData.times[lastIndex] : null;

        if (lastTime === time) {
            // Merge into existing row
            if (sys) vitalsData.systolic[lastIndex] = parseInt(sys);
            if (dia) vitalsData.diastolic[lastIndex] = parseInt(dia);
            if (pulse) vitalsData.pulse[lastIndex] = parseInt(pulse);
            if (spo2) vitalsData.spo2[lastIndex] = parseInt(spo2);
            if (etco2) vitalsData.etco2[lastIndex] = parseInt(etco2);
            if (bt) vitalsData.bt[lastIndex] = parseFloat(bt);
            if (rr) vitalsData.rr[lastIndex] = parseInt(rr);
            if (iso) vitalsData.iso[lastIndex] = parseFloat(iso);

            // Re-calc mean if needed
            if (vitalsData.systolic[lastIndex] !== null && vitalsData.diastolic[lastIndex] !== null) {
                const s = vitalsData.systolic[lastIndex];
                const d = vitalsData.diastolic[lastIndex];
                vitalsData.mean[lastIndex] = Math.round(d + (s - d) / 3);
            }
        } else {
            // New row
            vitalsData.times.push(time);
            vitalsData.systolic.push(sys ? parseInt(sys) : null);
            vitalsData.diastolic.push(dia ? parseInt(dia) : null);
            vitalsData.pulse.push(pulse ? parseInt(pulse) : null);
            vitalsData.spo2.push(spo2 ? parseInt(spo2) : null);
            vitalsData.etco2.push(etco2 ? parseInt(etco2) : null);
            vitalsData.bt.push(bt ? parseFloat(bt) : null);
            vitalsData.rr.push(rr ? parseInt(rr) : null);
            vitalsData.iso.push(iso ? parseFloat(iso) : null);

            // Ensure Fluids array stays in sync
            if (vitalsData.fluids.length < vitalsData.times.length) {
                vitalsData.fluids.push(null);
            }

            let mean = null;
            if (sys && dia) {
                mean = Math.round(parseInt(dia) + (parseInt(sys) - parseInt(dia)) / 3);
                vitalsData.mean.push(mean);
            } else {
                vitalsData.mean.push(null);
            }
            // Update all fluid datasets to match times length for NEW rows
            chart.data.datasets.forEach(ds => {
                if (ds.yAxisID === 'yFluid') {
                    while (ds.data.length < vitalsData.times.length) {
                        ds.data.push(null);
                    }
                }
            });
        }

        updateVitalsHistoryTable();

        // Force chart to update with new data
        refreshChart();
        saveToLocal();

        ['input-sys', 'input-dia', 'input-pulse', 'input-spo2', 'input-etco2', 'input-bt', 'input-rr', 'input-iso'].forEach(id => {
            document.getElementById(id).value = '';
        });
    }
}

function updateVitalsHistoryTable() {
    const tbody = document.querySelector('#vitals-history tbody');
    const theadTr = document.querySelector('#vitals-history thead tr');
    tbody.innerHTML = '';

    // 1. Identify all unique fluid names
    const fluidNames = new Set();
    vitalsData.fluids.forEach(f => {
        if (f) Object.keys(f).forEach(k => fluidNames.add(k));
    });
    const uniqueFluids = Array.from(fluidNames).sort();

    // 2. Update Header
    // Base headers: Time, SYS, DIA, MEAN, PULSE, SpO2, ETCO2, BT
    // Then Fluids... Then Action
    let headerHtml = `
        <th>Time</th>
        <th>SYS</th>
        <th>DIA</th>
        <th>MEAN</th>
        <th>PULSE</th>
        <th>SpO2</th>
        <th>ETCO2</th>
        <th>BT</th>
        <th>RR</th>
        <th>ISO %</th>
    `;
    uniqueFluids.forEach(name => {
        headerHtml += `<th>${name} (ml/hr)</th>`;
    });
    headerHtml += `<th>Action</th>`;
    theadTr.innerHTML = headerHtml;

    // 3. Generate Rows
    for (let i = vitalsData.times.length - 1; i >= 0; i--) {
        const row = document.createElement('tr');
        const mkInput = (val, field) => `
            <input type="number" 
                   class="vital-edit" 
                   data-index="${i}" 
                   data-field="${field}" 
                   value="${val !== null && val !== undefined ? val : ''}" 
                   style="width: 50px; text-align: center; border: 1px solid #ddd; border-radius: 4px;">
        `;

        let rowHtml = `
            <td>${vitalsData.times[i]}</td>
            <td>${mkInput(vitalsData.systolic[i], 'systolic')}</td>
            <td>${mkInput(vitalsData.diastolic[i], 'diastolic')}</td>
            <td>${vitalsData.mean[i] !== null ? vitalsData.mean[i] : '--'}</td>
            <td>${mkInput(vitalsData.pulse[i], 'pulse')}</td>
            <td>${mkInput(vitalsData.spo2[i], 'spo2')}</td>
            <td>${mkInput(vitalsData.etco2[i], 'etco2')}</td>
            <td>${mkInput(vitalsData.bt[i], 'bt')}</td>
            <td>${mkInput(vitalsData.rr[i], 'rr')}</td>
            <td>${mkInput(vitalsData.iso[i], 'iso')}</td>
        `;

        // Fluid Cells
        uniqueFluids.forEach(name => {
            const val = (vitalsData.fluids[i] && vitalsData.fluids[i][name] !== undefined) ? vitalsData.fluids[i][name] : '';
            rowHtml += `
            <td>
                <input type="number" 
                   class="vital-edit-fluid" 
                   data-index="${i}" 
                   data-fluid-name="${name}" 
                   value="${val}" 
                   placeholder="-"
                   style="width: 60px; text-align: center; border: 1px solid #ddd; border-radius: 4px;">
            </td>
            `;
        });

        rowHtml += `<td><button class="btn-danger btn-sm delete-vital-btn" data-index="${i}">Delete</button></td>`;
        row.innerHTML = rowHtml;
        tbody.appendChild(row);
    }
}

// Add delegated listeners once
// Listeners moved to main init block


// --- Drug & Fluid Rows ---
function addDrugRow(data = {}) {
    const tbody = document.querySelector('#drug-table tbody');
    const row = document.createElement('tr');
    const time = data.time || new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' });

    const drugOpts = '<option value="">Select Drug</option>' + DRUG_OPTIONS.map(d => `<option value="${d}" ${data.name === d ? 'selected' : ''}>${d}</option>`).join('');
    const unitOpts = DOSE_UNITS.map(u => `<option value="${u}" ${data.unit === u ? 'selected' : ''}>${u}</option>`).join('');
    const routeOpts = ROUTE_OPTIONS.map(r => `<option value="${r}" ${data.route === r ? 'selected' : ''}>${r}</option>`).join('');

    row.innerHTML = `
        <td><select class="drug-name">${drugOpts}</select></td>
        <td><input type="number" step="0.01" value="${data.dose || ''}" class="drug-dose" inputmode="decimal" placeholder=""></td>
        <td><select class="drug-unit">${unitOpts}</select></td>
        <td><span class="total-display">--</span></td>
        <td><select class="drug-route">${routeOpts}</select></td>
        <td><input type="time" value="${time}"></td>
        <td><button class="btn-danger btn-sm btn-delete-drug">×</button></td>
    `;
    tbody.appendChild(row);

    const doseInput = row.querySelector('.drug-dose');
    const unitSelect = row.querySelector('.drug-unit');
    const deleteBtn = row.querySelector('.btn-delete-drug');

    doseInput.addEventListener('input', () => calculateTotal(row));
    unitSelect.addEventListener('change', () => calculateTotal(row));
    deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        row.remove();
        saveToLocal();
    });

    calculateTotal(row);
}

function calculateTotal(row) {
    const weight = parseFloat(document.getElementById('weight').value) || 1;
    const dose = parseFloat(row.querySelector('.drug-dose').value) || 0;
    const totalEl = row.querySelector('.total-display');

    // Simplification: if unit contains /kg, multiply by weight. others? 
    // We'll treat mg/kg, mcg/kg etc as needing weight multiplication
    const unit = row.querySelector('.drug-unit').value;
    const needsWeight = unit.includes('/kg') || unit.includes('/m^2');
    const total = needsWeight ? (dose * weight) : dose;

    // Display total with unit
    const totalUnit = unit.includes('mg') ? 'mg' : (unit.includes('mcg') ? 'mcg' : '');
    totalEl.textContent = total ? `${total.toFixed(3)} ${totalUnit}` : '--';
}


function addFluidRow(data = {}) {
    const tbody = document.querySelector('#fluid-table tbody');
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><input type="text" value="${data.name || ''}" placeholder="Fluid Name"></td>
        <td><input type="number" value="${data.rate || ''}" placeholder="ml/hr" inputmode="numeric"></td>
        <td><button class="btn-primary btn-sm btn-log-fluid">LOG</button></td>
        <td><button class="btn-danger btn-sm btn-delete-fluid">×</button></td>
    `;
    tbody.appendChild(row);
    row.querySelector('.btn-log-fluid').addEventListener('click', (e) => {
        e.preventDefault();
        logFluidPulse(row);
    });
    row.querySelector('.btn-delete-fluid').addEventListener('click', (e) => {
        e.preventDefault();
        row.remove();
        saveToLocal();
    });
}

function addEpiduralRow(data = {}) {
    const tbody = document.querySelector('#epidural-table tbody');
    const row = document.createElement('tr');

    let drugOpts = EPIDURAL_OPTIONS.map(d => `<option value="${d}" ${d === data.drug ? 'selected' : ''}>${d}</option>`).join('');
    drugOpts = `<option value="">Select Drug</option>` + drugOpts;

    let unitOpts = DOSE_UNITS.map(u => `<option value="${u}" ${u === (data.unit || 'mg/kg') ? 'selected' : ''}>${u}</option>`).join('');

    row.innerHTML = `
        <td><select class="epidural-drug">${drugOpts}</select></td>
        <td><input type="number" step="0.01" value="${data.dose || ''}" class="epidural-dose" inputmode="decimal"></td>
        <td><select class="epidural-unit">${unitOpts}</select></td>
        <td><span class="total-display-epidural">--</span></td>
        <td><input type="text" value="${data.route || ''}" class="epidural-route" placeholder="Route"></td>
        <td><button class="btn-danger btn-sm btn-delete-epidural">×</button></td>
    `;
    tbody.appendChild(row);

    row.querySelector('.btn-delete-epidural').addEventListener('click', (e) => {
        e.preventDefault();
        row.remove();
        saveToLocal();
    });

    const doseInput = row.querySelector('.epidural-dose');
    const unitSelect = row.querySelector('.epidural-unit');

    doseInput.addEventListener('input', () => calculateEpiduralTotal(row));
    unitSelect.addEventListener('change', () => calculateEpiduralTotal(row));

    // Auto-save on input
    row.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('change', saveToLocal);
    });

    calculateEpiduralTotal(row);
}

function calculateEpiduralTotal(row) {
    const weight = parseFloat(document.getElementById('weight').value) || 1;
    const dose = parseFloat(row.querySelector('.epidural-dose').value) || 0;
    const totalEl = row.querySelector('.total-display-epidural');

    const unit = row.querySelector('.epidural-unit').value;
    const needsWeight = unit.includes('/kg') || unit.includes('/m^2');
    const total = needsWeight ? (dose * weight) : dose;

    // Display total with unit
    const totalUnit = unit.includes('mg') ? 'mg' : (unit.includes('mcg') ? 'mcg' : '');
    totalEl.textContent = total ? `${total.toFixed(3)} ${totalUnit}` : '--';
}

function updateAllDrugTotals() {
    document.querySelectorAll('#drug-table tbody tr').forEach(calculateTotal);
    document.querySelectorAll('#epidural-table tbody tr').forEach(calculateEpiduralTotal);
}
function logFluidPulse(row) {
    const name = row.querySelector('td:nth-child(1) input').value;
    const rate = row.querySelector('td:nth-child(2) input').value;
    if (name && rate) {
        const time = new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' });
        const lastIndex = vitalsData.times.length - 1;
        const lastTime = lastIndex >= 0 ? vitalsData.times[lastIndex] : null;

        if (lastTime === time) {
            // Merge/Update existing
            if (!vitalsData.fluids[lastIndex]) vitalsData.fluids[lastIndex] = {};
            vitalsData.fluids[lastIndex][name] = parseFloat(rate);
        } else {
            // Add to vitals data
            vitalsData.times.push(time);
            vitalsData.systolic.push(null);
            vitalsData.diastolic.push(null);
            vitalsData.mean.push(null);
            vitalsData.pulse.push(null);
            vitalsData.spo2.push(null);
            vitalsData.etco2.push(null);
            vitalsData.bt.push(null);
            vitalsData.rr.push(null);
            vitalsData.iso.push(null);
            vitalsData.fluids.push({ [name]: parseFloat(rate) });
        }

        rebuildFluidDatasets();
        updateVitalsHistoryTable(); // Add this to ensure table shows the fluid if it created a new row
        refreshChart();
        saveToLocal();

        // Clear only the rate input, keep name for convenience? Or clear both?
        // User asked "monitoring record input cells... auto clear".
        // Usually name might be kept, but let's clear rate definitely.
        // Let's clear rate.
        row.querySelector('td:nth-child(2) input').value = '';
    }
}

function refreshChart() {
    updateChartAxes();
    chart.data.labels = getChartLabels();
    chart.data.datasets[0].data = vitalsData.systolic;
    chart.data.datasets[1].data = vitalsData.diastolic;
    chart.data.datasets[2].data = vitalsData.mean;
    chart.data.datasets[3].data = vitalsData.pulse;
    chart.data.datasets[4].data = vitalsData.spo2;
    chart.data.datasets[5].data = vitalsData.etco2;
    chart.data.datasets[6].data = vitalsData.bt;
    chart.data.datasets[7].data = vitalsData.rr;
    chart.data.datasets[8].data = vitalsData.iso;
    chart.update('none'); // Immediate update without animation
}

function updateChartAxes() {
    // Calculate dynamic Y axis max for vitals
    const vitalValues = [
        ...vitalsData.systolic.filter(v => v !== null),
        ...vitalsData.diastolic.filter(v => v !== null),
        ...vitalsData.pulse.filter(v => v !== null),
        ...vitalsData.spo2.filter(v => v !== null),
        ...vitalsData.etco2.filter(v => v !== null),
        ...vitalsData.bt.filter(v => v !== null)
    ];
    const maxVital = vitalValues.length > 0 ? Math.max(...vitalValues) : 0;
    // Default 200, scale up if needed
    chart.options.scales.y.max = maxVital > 200 ? Math.ceil(maxVital / 20) * 20 : 200;

    // Calculate dynamic Y axis max for fluids
    const fluidRates = vitalsData.fluids
        .filter(f => f !== null && f !== undefined && typeof f === 'object')
        .map(f => f.rate)
        .filter(r => r !== null && r !== undefined && !isNaN(r));
    const maxFluid = fluidRates.length > 0 ? Math.max(...fluidRates) : 0;

    // User requested max 50 default
    chart.options.scales.yFluid.max = maxFluid > 50 ? Math.ceil(maxFluid / 10) * 10 : 50;

    // Handle Horizontal Scrolling
    const container = document.querySelector('.chart-scroll-container');
    const totalPoints = chart.data.labels.length;
    // Base width is 100%. If points > 20, expand width.
    // Assuming each point needs roughly 40-50px to look good.
    if (totalPoints > 20) {
        container.style.width = `${totalPoints * 40}px`;
    } else {
        container.style.width = '100%';
    }
}

// --- Persistence ---
function saveToLocal() {
    const data = {
        patient: {},
        drugs: Array.from(document.querySelectorAll('#drug-table tbody tr')).map(row => ({
            name: row.querySelector('.drug-name').value,
            dose: row.querySelector('.drug-dose').value,
            unit: row.querySelector('.drug-unit').value,
            route: row.querySelector('.drug-route').value,
            time: row.querySelector('input[type="time"]').value
        })),
        fluids: Array.from(document.querySelectorAll('#fluid-table tbody tr')).map(row => ({
            name: row.querySelector('td:nth-child(1) input').value,
            rate: row.querySelector('td:nth-child(2) input').value
        })),
        epidurals: Array.from(document.querySelectorAll('#epidural-table tbody tr')).map(row => ({
            drug: row.querySelector('.epidural-drug').value,
            dose: row.querySelector('.epidural-dose').value,
            unit: row.querySelector('.epidural-unit').value,
            route: row.querySelector('.epidural-route').value
        })),
        vitals: vitalsData,
        notes: document.getElementById('procedure-note').value
    };

    FIELD_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            data.patient[id] = el.type === 'checkbox' ? el.checked : el.value;
        }
    });

    localStorage.setItem('anesthesia_data', JSON.stringify(data));
}

function loadFromLocal() {
    const saved = localStorage.getItem('anesthesia_data');
    if (saved) {
        const data = JSON.parse(saved);
        Object.keys(data.patient).forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (el.type === 'checkbox') el.checked = data.patient[id];
                else el.value = data.patient[id];
            }
        });
        if (data.drugs) {
            document.querySelector('#drug-table tbody').innerHTML = '';
            data.drugs.forEach(d => addDrugRow(d));
        }
        if (data.fluids) {
            document.querySelector('#fluid-table tbody').innerHTML = '';
            data.fluids.forEach(f => addFluidRow(f));
        }
        if (data.epidurals) {
            document.querySelector('#epidural-table tbody').innerHTML = '';
            data.epidurals.forEach(e => addEpiduralRow(e));
        }
        if (data.vitals) {
            Object.assign(vitalsData, data.vitals);
            // Force chart to update with loaded data
            // Force chart to update with loaded data
            rebuildFluidDatasets(); // Restore fluid datasets
            refreshChart();
            updateVitalsHistoryTable();
        }
        if (data.rr) {
            vitalsData.rr = data.rr;
        }
        if (data.notes) document.getElementById('procedure-note').value = data.notes;
    } else {
        addDrugRow();
        addFluidRow();
        addEpiduralRow();
    }
}

function updateTime() {
    const el = document.getElementById('current-time-display');
    if (el) el.textContent = new Date().toLocaleTimeString('zh-TW', { hour12: false });
}

// --- Timer Logic ---
function startTimer() {
    if (isTimerRunning) return;

    timerStartTime = Date.now() - timerElapsedTime;
    isTimerRunning = true;
    timerInterval = setInterval(updateTimerDisplay, 1000);

    document.getElementById('btn-start-case').disabled = true;
    document.getElementById('btn-end-case').disabled = false;

    saveTimerState();
}

function stopTimer() {
    if (!isTimerRunning) return;

    clearInterval(timerInterval);
    isTimerRunning = false;

    document.getElementById('btn-start-case').disabled = false;
    document.getElementById('btn-end-case').disabled = true;

    saveTimerState();
}

function updateTimerDisplay() {
    const now = Date.now();
    timerElapsedTime = now - timerStartTime;
    const totalSeconds = Math.floor(timerElapsedTime / 1000);

    const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const s = String(totalSeconds % 60).padStart(2, '0');

    document.getElementById('timer-display').textContent = `${h}:${m}:${s}`;
    saveTimerState();
}

function saveTimerState() {
    const state = {
        startTime: timerStartTime,
        elapsedTime: timerElapsedTime,
        isRunning: isTimerRunning,
        lastUpdated: Date.now()
    };
    localStorage.setItem('anesthesia_timer', JSON.stringify(state));
}

function loadTimerState() {
    const saved = localStorage.getItem('anesthesia_timer');
    if (saved) {
        const state = JSON.parse(saved);
        timerElapsedTime = state.elapsedTime || 0;
        isTimerRunning = state.isRunning || false;

        if (isTimerRunning) {
            // Need to account for time while page was closed?
            // Usually anesthesia timers should track real elapsed time from start.
            // If running, startTime should be preserved.
            timerStartTime = state.startTime;

            // Adjust for time away
            const now = Date.now();
            // Actually, if we use startTime, we just resume checking diff.
            // But if we want to pause while closed? User said "persistence".
            // Standard stopwatch behavior:
            // If it was running, it should effectively keep running.

            timerInterval = setInterval(updateTimerDisplay, 1000);
            document.getElementById('btn-start-case').disabled = true;
            document.getElementById('btn-end-case').disabled = false;
        } else {
            // Restore display
            const totalSeconds = Math.floor(timerElapsedTime / 1000);
            const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
            const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
            const s = String(totalSeconds % 60).padStart(2, '0');
            document.getElementById('timer-display').textContent = `${h}:${m}:${s}`;

            document.getElementById('btn-start-case').disabled = false;
            document.getElementById('btn-end-case').disabled = true;
        }
    }
}

function getChartLabels() {
    const labels = [...vitalsData.times];
    while (labels.length < MIN_CHART_SLOTS) {
        labels.push('');
    }
    return labels;
}


function rebuildFluidDatasets() {
    // Clear existing fluid datasets
    while (chart.data.datasets.length > 9) {
        chart.data.datasets.pop();
    }

    const colors = ['#e74c3c', '#3498db', '#1abc9c', '#f39c12', '#9b59b6', '#34495e'];
    let colorIndex = 0;

    // 1. Identify unique fluid names
    const fluidNames = new Set();
    vitalsData.fluids.forEach(f => {
        if (f) Object.keys(f).forEach(k => fluidNames.add(k));
    });

    // 2. Create datasets for each unique name
    fluidNames.forEach(name => {
        const dataArr = vitalsData.times.map((_, i) => {
            if (vitalsData.fluids[i] && vitalsData.fluids[i][name] !== undefined) {
                return vitalsData.fluids[i][name];
            }
            return null;
        });

        const ds = {
            label: name,
            data: dataArr,
            borderColor: colors[colorIndex % colors.length],
            pointStyle: 'rect',
            borderWidth: 2,
            tension: 0.1,
            spanGaps: true,
            yAxisID: 'yFluid'
        };
        chart.data.datasets.push(ds);
        colorIndex++;
    });
}

// --- Tab Switching Logic ---
// --- Tab Switching Logic ---
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelector('.tab-content-wrapper')
        ? document.querySelectorAll('.tab-content')
        : [];

    if (tabBtns.length === 0) {
        console.warn('No tab buttons found');
        return;
    }

    function activateTab(targetId) {
        let isClosing = false;

        // Check if we are closing the currently active tab
        tabBtns.forEach(b => {
            if (b.dataset.tab === targetId && b.classList.contains('active')) {
                isClosing = true;
            }
        });

        // Close all tabs first (RESET state)
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        // If we were NOT closing the current tab, then open the NEW one
        // (If we were closing it, we do nothing and leave everything closed -> 'Main Screen' view)
        if (!isClosing) {
            tabBtns.forEach(b => {
                if (b.dataset.tab === targetId) b.classList.add('active');
            });
            tabContents.forEach(c => {
                if (c.id === targetId) c.classList.add('active');
            });
        }
    }

    tabBtns.forEach(btn => {
        // Clone button to remove old listeners if any (though init runs once usually)
        // Or just use a flag? Safer to rely on clean DOM or just one listener.
        // Since we are replacing the function, just add listener.
        btn.onclick = (e) => { // using onclick to override any previous listeners if simple
            e.preventDefault();
            activateTab(btn.dataset.tab);
        };
    });

    // Default: Ensure NO tab is active initially (matches HTML)
    // We do NOT auto-activate the first tab anymore.
}

// Run immediately if DOM is ready (modules are deferred, so usually it is)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTabs);
} else {
    initTabs();
}
