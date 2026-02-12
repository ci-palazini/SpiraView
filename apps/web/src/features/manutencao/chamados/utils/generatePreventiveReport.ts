import { jsPDF } from 'jspdf';
import { LOGO_SPIRAX_BASE64 } from './logoBase64';

// ---------- Types ----------
export interface ReportChecklistItem {
    item: string;
    resposta: 'sim' | 'nao';
}

export interface ReportObservacao {
    autor: string;
    data: string | null;
    texto: string;
}

export interface PreventiveReportData {
    maquina: string;
    descricao: string;
    manutentorNome: string;
    dataAbertura: string | null;
    dataConclusao: string | null;
    checklist: ReportChecklistItem[];
    observacoes: ReportObservacao[];
}

interface ReportLabels {
    title: string;
    subtitle: string;
    machine: string;
    description: string;
    maintainer: string;
    maintenanceLeader: string;
    maintenanceLeaderName: string;
    coordinator: string;
    openedAt: string;
    concludedAt: string;
    checklistTitle: string;
    itemCol: string;
    resultCol: string;
    conforme: string;
    naoConforme: string;
    observationsTitle: string;
    noObservations: string;
    page: string;
    of: string;
    generatedAt: string;
    coordinatorName: string;
}

// ---------- Constants ----------
const MARGIN_LEFT = 20;
const MARGIN_RIGHT = 20;
const PAGE_WIDTH = 210; // A4
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const HEADER_COLOR: [number, number, number] = [0, 51, 102]; // dark navy blue
const ACCENT_COLOR: [number, number, number] = [0, 102, 153]; // teal accent
const CONFORME_COLOR: [number, number, number] = [34, 139, 34];  // green
const NAO_CONFORME_COLOR: [number, number, number] = [220, 53, 69]; // red
const TABLE_HEADER_BG: [number, number, number] = [0, 51, 102];
const TABLE_ROW_ALT_BG: [number, number, number] = [240, 244, 248];
const BORDER_COLOR: [number, number, number] = [200, 210, 220];

// ---------- Helper ----------
function formatDateForReport(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
        const d = new Date(dateStr.replace(' ', 'T'));
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return '—';
    }
}

// ---------- Main ----------
export function generatePreventiveReport(
    data: PreventiveReportData,
    labels: ReportLabels,
): void {
    const doc = new jsPDF('p', 'mm', 'a4');
    let y = 15;

    // ============ HEADER ============
    // Logo
    try {
        doc.addImage(LOGO_SPIRAX_BASE64, 'PNG', MARGIN_LEFT, y, 45, 12);
    } catch (e) {
        console.warn('Could not add logo to PDF:', e);
    }

    // Title block
    doc.setFontSize(18);
    doc.setTextColor(...HEADER_COLOR);
    doc.setFont('helvetica', 'bold');
    doc.text(labels.title.toUpperCase(), PAGE_WIDTH - MARGIN_RIGHT, y + 5, { align: 'right' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...ACCENT_COLOR);
    doc.text(labels.subtitle, PAGE_WIDTH - MARGIN_RIGHT, y + 11, { align: 'right' });

    y += 18;

    // Divider line
    doc.setDrawColor(...HEADER_COLOR);
    doc.setLineWidth(0.8);
    doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
    y += 8;

    // ============ INFO SECTION ============
    const infoFields: [string, string][] = [
        [labels.machine, data.maquina],
        [labels.description, data.descricao],
        [labels.maintainer, data.manutentorNome || '—'],
        [labels.maintenanceLeader, labels.maintenanceLeaderName],
        [labels.coordinator, labels.coordinatorName],
        [labels.openedAt, formatDateForReport(data.dataAbertura)],
        [labels.concludedAt, formatDateForReport(data.dataConclusao)],
    ];

    // Info card background
    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(...BORDER_COLOR);
    doc.roundedRect(MARGIN_LEFT, y - 3, CONTENT_WIDTH, infoFields.length * 8 + 6, 3, 3, 'FD');

    doc.setFontSize(9);
    for (const [label, value] of infoFields) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(80, 80, 80);
        doc.text(label + ':', MARGIN_LEFT + 5, y + 3);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 30, 30);
        doc.text(value, MARGIN_LEFT + 48, y + 3);
        y += 8;
    }
    y += 12;

    // ============ CHECKLIST TABLE ============
    if (data.checklist.length > 0) {
        // Section header
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...HEADER_COLOR);
        doc.text(labels.checklistTitle, MARGIN_LEFT, y);
        y += 6;

        // Table header
        const colNum = 12;
        const colItem = CONTENT_WIDTH - colNum - 40;
        const colResult = 40;

        doc.setFillColor(...TABLE_HEADER_BG);
        doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, 8, 'F');

        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.text('#', MARGIN_LEFT + 4, y + 5.5);
        doc.text(labels.itemCol, MARGIN_LEFT + colNum + 3, y + 5.5);
        doc.text(labels.resultCol, MARGIN_LEFT + colNum + colItem + 5, y + 5.5);
        y += 8;

        // Table rows
        doc.setFontSize(8);
        data.checklist.forEach((item, idx) => {
            // Check if we need a new page
            if (y > 265) {
                doc.addPage();
                y = 20;
            }

            // Alternating row background
            if (idx % 2 === 0) {
                doc.setFillColor(...TABLE_ROW_ALT_BG);
                doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, 7, 'F');
            }

            // Row border bottom
            doc.setDrawColor(...BORDER_COLOR);
            doc.setLineWidth(0.2);
            doc.line(MARGIN_LEFT, y + 7, MARGIN_LEFT + CONTENT_WIDTH, y + 7);

            // Number
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text(String(idx + 1), MARGIN_LEFT + 4, y + 4.8);

            // Item text (with word wrap)
            doc.setTextColor(30, 30, 30);
            const itemText = item.item || '(sem texto)';
            const maxItemWidth = colItem - 6;
            const lines = doc.splitTextToSize(itemText, maxItemWidth);
            doc.text(lines[0], MARGIN_LEFT + colNum + 3, y + 4.8);

            // Result
            const isConforme = item.resposta === 'sim';
            doc.setFont('helvetica', 'bold');
            if (isConforme) {
                doc.setTextColor(...CONFORME_COLOR);
                doc.text(`✓ ${labels.conforme}`, MARGIN_LEFT + colNum + colItem + 5, y + 4.8);
            } else {
                doc.setTextColor(...NAO_CONFORME_COLOR);
                doc.text(`✗ ${labels.naoConforme}`, MARGIN_LEFT + colNum + colItem + 5, y + 4.8);
            }

            y += 7;

            // Extra lines if item text is long
            if (lines.length > 1) {
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(30, 30, 30);
                for (let i = 1; i < lines.length; i++) {
                    if (y > 265) {
                        doc.addPage();
                        y = 20;
                    }
                    doc.text(lines[i], MARGIN_LEFT + colNum + 3, y + 4.8);
                    y += 5;
                }
            }
        });

        y += 6;
    }

    // ============ OBSERVATIONS ============
    if (data.observacoes.length > 0) {
        if (y > 250) {
            doc.addPage();
            y = 20;
        }

        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...HEADER_COLOR);
        doc.text(labels.observationsTitle, MARGIN_LEFT, y);
        y += 7;

        doc.setFontSize(8);
        data.observacoes.forEach((obs) => {
            if (y > 260) {
                doc.addPage();
                y = 20;
            }
            // Author and date
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...ACCENT_COLOR);
            const autorDate = `${obs.autor || '—'} (${formatDateForReport(obs.data)})`;
            doc.text(autorDate, MARGIN_LEFT + 2, y);
            y += 4;

            // Text
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(50, 50, 50);
            const obsLines = doc.splitTextToSize(obs.texto || '', CONTENT_WIDTH - 4);
            doc.text(obsLines, MARGIN_LEFT + 2, y);
            y += obsLines.length * 4 + 3;

            // Separator
            doc.setDrawColor(...BORDER_COLOR);
            doc.setLineWidth(0.15);
            doc.line(MARGIN_LEFT + 2, y, MARGIN_LEFT + CONTENT_WIDTH - 2, y);
            y += 4;
        });
    }

    // ============ FOOTER ============
    const pageCount = doc.getNumberOfPages();
    const now = new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);

        // Footer line
        doc.setDrawColor(...BORDER_COLOR);
        doc.setLineWidth(0.3);
        doc.line(MARGIN_LEFT, 285, PAGE_WIDTH - MARGIN_RIGHT, 285);

        // Page number
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.setFont('helvetica', 'normal');
        doc.text(
            `${labels.page} ${i} ${labels.of} ${pageCount}`,
            PAGE_WIDTH - MARGIN_RIGHT,
            289,
            { align: 'right' },
        );

        // Generation date
        doc.text(
            `${labels.generatedAt}: ${now}`,
            MARGIN_LEFT,
            289,
        );
    }

    // ============ SAVE ============
    const fileName = `Relatorio_Preventiva_${data.maquina.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);
}
