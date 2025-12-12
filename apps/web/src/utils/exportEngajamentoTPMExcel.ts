import { saveAs } from 'file-saver';

type LinhaResumo = {
    dateIso: string;              // "2025-12-08"
    enviadoT1: string;            // "12/14" | "Sábado" | "-"
    enviadoT2: string;            // "0/14" | "Domingo" | "-"
    semEnvioT1: string;           // "TCN-16, CT-01" | "Todas" | "-"
    semEnvioT2: string;           // "Todas" | "-" ...
    isWeekend?: boolean;
};

type DetalheDia = {
    maquina: string;
    turno1: 'Enviado' | 'Pendente';
    operadores1: string;
    turno2: 'Enviado' | 'Pendente';
    operadores2: string;
    ultimoChecklist: string;
};

function fmtPtBrDateTimeTitle(d: Date) {
    const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(d);
    const time = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(d);
    return `${date}, ${time}`;
}

export async function exportEngajamentoTPMExcel(params: {
    linhas: LinhaResumo[];
    detalhesDoDia?: DetalheDia[];
    maquinasSemChecklist?: string[];
    fileName?: string; // sem extensão
}) {
    // import dinâmico pra não pesar o bundle inicial
    const ExcelJS = await import('exceljs');

    const wb = new ExcelJS.Workbook();
    wb.creator = 'TPM';
    wb.created = new Date();

    const ws = wb.addWorksheet('Planilha1', {
        views: [{ state: 'frozen', ySplit: 3 }],
    });

    // Layout (A..K) seguindo seu arquivo: A-C Data | D-G Enviadas | H-K Sem envio
    ws.columns = [
        { key: 'A', width: 12 }, // A
        { key: 'B', width: 2 }, // B (espaço)
        { key: 'C', width: 2 }, // C (espaço)
        { key: 'D', width: 16 }, // D
        { key: 'E', width: 2 }, // E (espaço)
        { key: 'F', width: 16 }, // F
        { key: 'G', width: 2 }, // G (espaço)
        { key: 'H', width: 40 }, // H
        { key: 'I', width: 2 }, // I (espaço)
        { key: 'J', width: 40 }, // J
        { key: 'K', width: 2 }, // K (espaço)
    ];

    const thin = { style: 'thin' as const };
    const medium = { style: 'medium' as const };

    const borderAllThin = {
        top: thin, left: thin, bottom: thin, right: thin,
    };

    const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1F2937' } };
    const headerFont = { bold: true, color: { argb: 'FFFFFFFF' } };

    // ---- Título ----
    ws.mergeCells('A1:K1');
    ws.getCell('A1').value = `Engajamento TPM - ${fmtPtBrDateTimeTitle(new Date())}`;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    // borda mais "forte" no topo
    for (const addr of ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1', 'I1', 'J1', 'K1']) {
        ws.getCell(addr).border = { top: medium, left: medium, bottom: thin, right: thin };
    }
    ws.getRow(1).height = 24;

    // ---- Cabeçalhos (mesclados) ----
    ws.mergeCells('A2:C3');
    ws.getCell('A2').value = 'Data';

    ws.mergeCells('D2:G2');
    ws.getCell('D2').value = 'Máquinas enviadas';

    ws.mergeCells('H2:K2');
    ws.getCell('H2').value = 'Máquinas sem envio';

    ws.mergeCells('D3:E3');
    ws.getCell('D3').value = '1º Turno';

    ws.mergeCells('F3:G3');
    ws.getCell('F3').value = '2º Turno';

    ws.mergeCells('H3:I3');
    ws.getCell('H3').value = '1º Turno';

    ws.mergeCells('J3:K3');
    ws.getCell('J3').value = '2º Turno';

    const headerCells = ['A2', 'D2', 'H2', 'D3', 'F3', 'H3', 'J3'];
    for (const addr of headerCells) {
        const c = ws.getCell(addr);
        c.fill = headerFill;
        c.font = headerFont;
        c.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    // bordas nos cabeçalhos
    for (let r = 2; r <= 3; r++) {
        for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']) {
            ws.getCell(`${col}${r}`).border = borderAllThin;
        }
    }
    ws.getRow(2).height = 20;
    ws.getRow(3).height = 18;

    // ---- Linhas de dados ----
    let row = 4;
    for (const l of params.linhas) {
        ws.mergeCells(`A${row}:C${row}`);
        ws.getCell(`A${row}`).value = new Date(l.dateIso + 'T00:00:00');
        ws.getCell(`A${row}`).numFmt = 'dd/mm/yyyy';
        ws.getCell(`A${row}`).alignment = { horizontal: 'center', vertical: 'middle' };

        if (l.isWeekend) {
            ws.mergeCells(`D${row}:G${row}`);
            ws.mergeCells(`H${row}:K${row}`);

            ws.getCell(`D${row}`).value = l.enviadoT1; // "Sábado"/"Domingo"
            ws.getCell(`H${row}`).value = l.semEnvioT1;

            ws.getCell(`D${row}`).alignment = { horizontal: 'center', vertical: 'middle' };
            ws.getCell(`H${row}`).alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
            ws.mergeCells(`D${row}:E${row}`);
            ws.mergeCells(`F${row}:G${row}`);
            ws.mergeCells(`H${row}:I${row}`);
            ws.mergeCells(`J${row}:K${row}`);

            ws.getCell(`D${row}`).value = l.enviadoT1;
            ws.getCell(`F${row}`).value = l.enviadoT2;
            ws.getCell(`H${row}`).value = l.semEnvioT1;
            ws.getCell(`J${row}`).value = l.semEnvioT2;

            ws.getCell(`D${row}`).alignment = { horizontal: 'center', vertical: 'middle' };
            ws.getCell(`F${row}`).alignment = { horizontal: 'center', vertical: 'middle' };

            ws.getCell(`H${row}`).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
            ws.getCell(`J${row}`).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        }

        // bordas finas em toda a linha
        for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']) {
            ws.getCell(`${col}${row}`).border = borderAllThin;
        }
        row++;
    }

    // ---- Linha informativa: Máquinas sem checklist configurado ----
    if (params.maquinasSemChecklist && params.maquinasSemChecklist.length > 0) {
        row++; // linha em branco
        ws.mergeCells(`A${row}:K${row}`);
        const semChecklistText = `Máquinas sem checklist configurado (${params.maquinasSemChecklist.length}): ${params.maquinasSemChecklist.join(', ')}`;
        ws.getCell(`A${row}`).value = semChecklistText;
        ws.getCell(`A${row}`).font = { italic: true, color: { argb: 'FF6B7280' } };
        ws.getCell(`A${row}`).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
        for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']) {
            ws.getCell(`${col}${row}`).border = borderAllThin;
        }
        ws.getRow(row).height = 22;
    }

    // ---- (Opcional) segunda aba com detalhamento do dia selecionado ----
    if (params.detalhesDoDia?.length) {
        const ws2 = wb.addWorksheet('Detalhes do dia', {
            views: [{ state: 'frozen', ySplit: 1 }],
        });

        ws2.columns = [
            { header: 'Máquina', key: 'maquina', width: 22 },
            { header: '1º turno', key: 't1', width: 12 },
            { header: 'Operadores 1º', key: 'op1', width: 28 },
            { header: '2º turno', key: 't2', width: 12 },
            { header: 'Operadores 2º', key: 'op2', width: 28 },
            { header: 'Último checklist', key: 'ult', width: 20 },
        ];

        const headerRow = ws2.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = headerFill;
        headerRow.alignment = { vertical: 'middle' };
        headerRow.height = 18;

        for (const d of params.detalhesDoDia) {
            ws2.addRow({
                maquina: d.maquina,
                t1: d.turno1,
                op1: d.operadores1,
                t2: d.turno2,
                op2: d.operadores2,
                ult: d.ultimoChecklist,
            });
        }

        ws2.eachRow((r) => {
            r.eachCell((c) => {
                c.border = borderAllThin;
                if (r.number > 1) c.alignment = { vertical: 'middle', wrapText: true };
            });
        });
    }

    const buffer = await wb.xlsx.writeBuffer();
    const name = (params.fileName || 'audicao') + '.xlsx';
    saveAs(
        new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        name
    );
}
