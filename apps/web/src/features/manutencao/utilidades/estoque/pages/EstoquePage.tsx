// src/features/estoque/pages/EstoquePage.tsx
import React, { useState, useEffect } from 'react';
import { listarPecas, excluirPeca } from '../../../../../services/apiClient';
import type { Peca } from '../../../../../types/api';

import styles from './EstoquePage.module.css';
import MovimentacaoModal from './MovimentacaoModal';
import PecaModal from './PecaModal';
import PageHeader from '../../../../../shared/components/PageHeader';
import ExportButtons from '../../../../../shared/components/ExportButtons';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import Skeleton from '@mui/material/Skeleton';
import usePermissions from '../../../../../hooks/usePermissions';

// Reaproveitando as helpers do histórico
import { exportToExcel } from '../../../../../utils/exportExcel';
import { exportToPdf } from '../../../../../utils/exportPdf';

// ---------- Types ----------
interface User {
    role?: string;
    email?: string;
}

interface EstoquePageProps {
    user: User;
}

// ---------- Component ----------
export default function EstoquePage({ user }: EstoquePageProps) {
    const { t } = useTranslation();
    const perm = usePermissions(user);
    const canEditEstoque = perm.canEdit('estoque');

    const [pecas, setPecas] = useState<Peca[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPeca, setSelectedPeca] = useState<Peca | null>(null);
    const [modalTipo, setModalTipo] = useState<'entrada' | 'saida'>('entrada');
    const [editingPeca, setEditingPeca] = useState<Peca | null | undefined>(undefined);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                const itens: Peca[] = await listarPecas();
                if (!alive) return;
                setPecas(itens);
            } catch (e) {
                console.error(e);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    const openModalMov = (peca: Peca, tipo: 'entrada' | 'saida') => {
        setSelectedPeca(peca);
        setModalTipo(tipo);
    };

    const handleDeletePeca = async (id: string) => {
        if (!window.confirm(t('estoque.confirm.delete'))) return;
        try {
            await excluirPeca(id, { role: user?.role, email: user?.email });
            setPecas((prev) => prev.filter((p) => p.id !== id));
            toast.success(t('estoque.toasts.deleted'));
        } catch (err) {
            console.error(err);
            toast.error(t('estoque.toasts.deleteFail'));
        }
    };

    // Excel
    const handleExportExcel = () => {
        const excelData = pecas.map((p) => ({
            [t('estoque.export.columns.code')]: p.codigo,
            [t('estoque.export.columns.name')]: p.nome,
            [t('estoque.export.columns.category')]: p.categoria,
            [t('estoque.export.columns.stock')]: p.estoqueAtual,
            [t('estoque.export.columns.min')]: p.estoqueMinimo,
            [t('estoque.export.columns.location')]: p.localizacao,
        }));
        exportToExcel(excelData, t('estoque.export.sheetName'), 'estoque');
    };

    // PDF
    const handleExportPdf = () => {
        const pdfColumns = [
            { key: 'codigo', label: t('estoque.export.columns.code') },
            { key: 'nome', label: t('estoque.export.columns.name') },
            { key: 'categoria', label: t('estoque.export.columns.category') },
            { key: 'estoqueAtual', label: t('estoque.export.columns.stock') },
            { key: 'estoqueMinimo', label: t('estoque.export.columns.min') },
            { key: 'localizacao', label: t('estoque.export.columns.location') },
        ];
        const pdfData = pecas.map((p) => ({
            codigo: p.codigo,
            nome: p.nome,
            categoria: p.categoria,
            estoqueAtual: p.estoqueAtual,
            estoqueMinimo: p.estoqueMinimo,
            localizacao: p.localizacao,
        }));
        exportToPdf(pdfData, pdfColumns, 'estoque');
    };

    return (
        <>
            <PageHeader
                title={t('estoque.title')}
                subtitle={t('estoque.subtitle', 'Gerencie o catálogo de peças, estoque mínimo e movimentações.')}
            />

            {/* Container branco principal */}
            <div className={styles.listContainer}>
                {/* Toolbar: criaÃ§Ã£o e exportaÃ§Ã£o */}
                <div className={styles.toolbar}>
                    {canEditEstoque && (
                        <button
                            className={styles.newButton}
                            onClick={() => setEditingPeca(null)}
                        >
                            {t('estoque.toolbar.new')}
                        </button>
                    )}
                    <ExportButtons
                        onExportExcel={handleExportExcel}
                        onExportPdf={handleExportPdf}
                    />
                </div>

                {/* Grid de cards */}
                <div className={styles.grid}>
                    {loading ? (
                        <>
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <div key={i} className={styles.cardCatalog}>
                                    <Skeleton variant="text" width="60%" height={28} sx={{ marginBottom: 1 }} />
                                    <Skeleton variant="text" width="80%" height={18} />
                                    <Skeleton variant="text" width="70%" height={18} />
                                    <Skeleton variant="text" width="50%" height={18} />
                                    <Skeleton variant="text" width="50%" height={18} />
                                    <Skeleton variant="text" width="65%" height={18} />
                                    <div className={styles.cardButtons} style={{ marginTop: 12 }}>
                                        <Skeleton variant="rectangular" width={60} height={28} sx={{ borderRadius: 1 }} />
                                        <Skeleton variant="rectangular" width={60} height={28} sx={{ borderRadius: 1 }} />
                                        <Skeleton variant="rectangular" width={60} height={28} sx={{ borderRadius: 1 }} />
                                        <Skeleton variant="rectangular" width={60} height={28} sx={{ borderRadius: 1 }} />
                                    </div>
                                </div>
                            ))}
                        </>
                    ) : pecas.length === 0 ? (
                        <p>{t('estoque.empty')}</p>
                    ) : (
                        pecas.map((p) => (
                            <div key={p.id} className={styles.cardCatalog}>
                                <h3>{p.nome}</h3>
                                <p>
                                    <strong>{t('estoque.card.labels.code')}</strong> {p.codigo}
                                </p>
                                <p>
                                    <strong>{t('estoque.card.labels.category')}</strong> {p.categoria}
                                </p>
                                <p>
                                    <strong>{t('estoque.card.labels.stock')}</strong> {p.estoqueAtual}
                                </p>
                                <p>
                                    <strong>{t('estoque.card.labels.min')}</strong> {p.estoqueMinimo}
                                </p>
                                <p>
                                    <strong>{t('estoque.card.labels.location')}</strong> {p.localizacao}
                                </p>

                                {canEditEstoque && (
                                    <div className={styles.cardButtons}>
                                        <button
                                            className={styles.buttonSmall}
                                            onClick={() => openModalMov(p, 'entrada')}
                                        >
                                            {t('estoque.card.buttons.in')}
                                        </button>
                                        <button
                                            className={styles.buttonSmall}
                                            onClick={() => openModalMov(p, 'saida')}
                                        >
                                            {t('estoque.card.buttons.out')}
                                        </button>
                                        <button
                                            className={styles.buttonSmall}
                                            onClick={() => setEditingPeca(p)}
                                        >
                                            {t('estoque.card.buttons.edit')}
                                        </button>
                                        <button
                                            className={styles.buttonSmallDelete}
                                            onClick={() => handleDeletePeca(p.id)}
                                        >
                                            {t('estoque.card.buttons.delete')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Modais */}
                {selectedPeca && (
                    <MovimentacaoModal
                        peca={selectedPeca}
                        tipo={modalTipo}
                        user={user}
                        onClose={() => setSelectedPeca(null)}
                        onSaved={(pecaAtualizada) => {
                            setPecas((prev) =>
                                prev.map((p) =>
                                    p.id === pecaAtualizada.id ? pecaAtualizada : p
                                )
                            );
                        }}
                    />
                )}

                {editingPeca !== undefined && (
                    <PecaModal
                        peca={editingPeca}
                        user={user}
                        onClose={() => setEditingPeca(undefined)}
                        onSaved={(saved) => {
                            setPecas((prev) => {
                                if (!saved || !saved.id) return prev;
                                const sem = prev.filter((p) => p.id !== saved.id);
                                return [...sem, saved].sort((a, b) =>
                                    String(a.codigo).localeCompare(String(b.codigo), 'pt')
                                );
                            });
                        }}
                    />
                )}
            </div>
        </>
    );
}
