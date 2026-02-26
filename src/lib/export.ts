/**
 * Módulo de exportação de dados — CSV e PDF.
 * Usa expo-print para PDF e expo-sharing para compartilhamento nativo.
 * Centralizado para reutilização em qualquer tela admin.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Define uma coluna para exportação.
 * @param key - Chave do objeto de dados
 * @param label - Rótulo exibido no cabeçalho do CSV/PDF
 */
export interface ExportColumn<T = Record<string, unknown>> {
    key: keyof T;
    label: string;
    /** Formatador opcional — transforma o valor bruto em string legível */
    format?: (value: unknown, row: T) => string;
}

/**
 * Gera arquivo CSV e abre a share sheet nativa do dispositivo.
 * Escapa aspas duplas e vírgulas nos valores para manter a integridade.
 *
 * @param data - Array de objetos a exportar
 * @param columns - Definição das colunas (chave + label)
 * @param filename - Nome do arquivo sem extensão
 */
export async function exportToCSV<T extends Record<string, unknown>>(
    data: T[],
    columns: ExportColumn<T>[],
    filename: string
): Promise<void> {
    if (data.length === 0) {
        throw new Error('Nenhum dado para exportar.');
    }

    // Cabeçalho
    const header = columns.map(c => `"${c.label}"`).join(',');

    // Linhas de dados
    const rows = data.map(row =>
        columns.map(col => {
            const raw = row[col.key];
            const value = col.format ? col.format(raw, row) : String(raw ?? '');
            // Escape de aspas duplas dentro do valor
            return `"${value.replace(/"/g, '""')}"`;
        }).join(',')
    );

    const csv = [header, ...rows].join('\n');

    // Salva temporariamente e compartilha
    const fileUri = `${FileSystem.cacheDirectory}${filename}.csv`;
    await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: `Exportar ${filename}`,
            UTI: 'public.comma-separated-values-text',
        });
    } else {
        throw new Error('Compartilhamento não disponível neste dispositivo.');
    }
}

/**
 * Gera relatório PDF com layout premium e abre a share sheet nativa.
 * Usa HTML + CSS para renderização profissional via expo-print.
 *
 * @param data - Array de objetos a exportar
 * @param columns - Definição das colunas
 * @param title - Título do relatório
 * @param filename - Nome do arquivo sem extensão
 */
export async function exportToPDF<T extends Record<string, unknown>>(
    data: T[],
    columns: ExportColumn<T>[],
    title: string,
    filename: string
): Promise<void> {
    if (data.length === 0) {
        throw new Error('Nenhum dado para exportar.');
    }

    const now = new Date().toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

    // Gera linhas da tabela HTML
    const tableRows = data.map((row, i) =>
        `<tr style="background:${i % 2 === 0 ? '#f8fafc' : '#ffffff'}">
            ${columns.map(col => {
            const raw = row[col.key];
            const value = col.format ? col.format(raw, row) : String(raw ?? '');
            return `<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;">${value}</td>`;
        }).join('')}
        </tr>`
    ).join('');

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Helvetica Neue','Arial',sans-serif; color: #1e293b; padding: 30px; }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 3px solid #ffe600; padding-bottom: 15px; }
            .title { font-size: 22px; font-weight: 700; color: #0f172a; }
            .subtitle { font-size: 11px; color: #64748b; margin-top: 4px; }
            .meta { font-size: 10px; color: #94a3b8; text-align: right; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background: #0f172a; color: #fff; padding: 10px 12px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
            .footer { margin-top: 20px; font-size: 9px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; }
        </style>
    </head>
    <body>
        <div class="header">
            <div>
                <div class="title">${title}</div>
                <div class="subtitle">Sistema Escalai — Relatório Exportado</div>
            </div>
            <div class="meta">
                <div>Gerado em: ${now}</div>
                <div>${data.length} registro(s)</div>
            </div>
        </div>

        <table>
            <thead>
                <tr>${columns.map(c => `<th>${c.label}</th>`).join('')}</tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>

        <div class="footer">
            Escalai © ${new Date().getFullYear()} — Documento gerado automaticamente. Dados sujeitos a atualização em tempo real.
        </div>
    </body>
    </html>`;

    // Gera o PDF e compartilha
    const { uri } = await Print.printToFileAsync({ html });

    // Renomeia para nome amigável
    const newUri = `${FileSystem.cacheDirectory}${filename}.pdf`;
    await FileSystem.moveAsync({ from: uri, to: newUri });

    if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(newUri, {
            mimeType: 'application/pdf',
            dialogTitle: `Exportar ${title}`,
            UTI: 'com.adobe.pdf',
        });
    } else {
        throw new Error('Compartilhamento não disponível neste dispositivo.');
    }
}
