import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Modal from '../../../shared/components/Modal';
import { ehsResolverObservadores } from '../../../services/apiClient';
import type { SafetyPendente } from '@spiraview/shared';
import type { Usuario } from '@spiraview/shared';
import { listarUsuarios } from '../../../services/apiClient';
import styles from './ResolverObservadoresModal.module.css';

interface Props {
    open: boolean;
    pendentes: SafetyPendente[];
    onClose: () => void;
    onResolved: () => void;
}

export default function ResolverObservadoresModal({ open, pendentes, onClose, onResolved }: Props) {
    const { t } = useTranslation();
    const [selections, setSelections] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [allUsers, setAllUsers] = useState<Usuario[]>([]);

    // Load all active users for the select fallback
    useEffect(() => {
        if (open) {
            listarUsuarios()
                .then(setAllUsers)
                .catch(() => {});
        }
    }, [open]);

    // Pre-fill selections with top candidate if available
    useEffect(() => {
        const defaults: Record<string, string> = {};
        for (const p of pendentes) {
            if (p.candidatos.length > 0) {
                defaults[p.observadorTexto] = p.candidatos[0].usuarioId;
            }
        }
        setSelections(defaults);
    }, [pendentes]);

    const handleChange = useCallback((observadorTexto: string, usuarioId: string) => {
        setSelections((prev) => {
            const next = { ...prev };
            if (usuarioId) {
                next[observadorTexto] = usuarioId;
            } else {
                delete next[observadorTexto];
            }
            return next;
        });
    }, []);

    const handleSubmit = useCallback(async () => {
        const resolucoes = Object.entries(selections)
            .filter(([, uid]) => uid)
            .map(([observadorTexto, usuarioId]) => ({ observadorTexto, usuarioId }));

        if (resolucoes.length === 0) {
            onClose();
            return;
        }

        setSubmitting(true);
        try {
            const res = await ehsResolverObservadores({ resolucoes });
            toast.success(
                t('ehs.resolver.success', {
                    mappings: res.mapeamentosSalvos,
                    observations: res.observacoesAtualizadas,
                })
            );
            onResolved();
            onClose();
        } catch (err: any) {
            toast.error(err?.message || t('ehs.resolver.error'));
        } finally {
            setSubmitting(false);
        }
    }, [selections, t, onResolved, onClose]);

    const selectedCount = Object.values(selections).filter(Boolean).length;

    // Build a set of candidate user IDs per pendente for ordering
    const candidateIds = new Set(pendentes.flatMap((p) => p.candidatos.map((c) => c.usuarioId)));

    return (
        <Modal
            isOpen={open}
            onClose={onClose}
            title={t('ehs.resolver.title', 'Resolver Observadores')}
        >
            {pendentes.length === 0 ? (
                <p className={styles.emptyHint}>{t('ehs.resolver.empty', 'Nenhum pendente.')}</p>
            ) : (
                <>
                    <div className={styles.pendentesGrid}>
                        {pendentes.map((p) => (
                            <div key={p.observadorTexto} className={styles.pendenteRow}>
                                <div className={styles.observadorInfo}>
                                    <div className={styles.observadorTexto}>{p.observadorTexto}</div>
                                    <div className={styles.registrosCount}>
                                        {t('ehs.resolver.records', { count: p.qtdRegistros })}
                                    </div>
                                </div>
                                <div className={styles.selectWrapper}>
                                    <select
                                        value={selections[p.observadorTexto] || ''}
                                        onChange={(e) => handleChange(p.observadorTexto, e.target.value)}
                                    >
                                        <option value="">{t('ehs.resolver.skip', '— Não mapear agora —')}</option>
                                        {/* Candidates first (with score) */}
                                        {p.candidatos.map((c) => (
                                            <option key={c.usuarioId} value={c.usuarioId}>
                                                {c.nome} ({Math.round(c.score * 100)}%)
                                            </option>
                                        ))}
                                        {/* Separator if there are candidates */}
                                        {p.candidatos.length > 0 && (
                                            <option disabled>{'────────────'}</option>
                                        )}
                                        {/* All other users */}
                                        {allUsers
                                            .filter((u) => !candidateIds.has(u.id))
                                            .map((u) => (
                                                <option key={u.id} value={u.id}>
                                                    {u.nome}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className={styles.actions}>
                        <button className={styles.cancelBtn} onClick={onClose} disabled={submitting}>
                            {t('common.cancel')}
                        </button>
                        <button className={styles.submitBtn} onClick={handleSubmit} disabled={submitting}>
                            {submitting
                                ? t('ehs.resolver.submitting', 'Salvando...')
                                : t('ehs.resolver.submit', `Mapear (${selectedCount})`)}
                        </button>
                    </div>
                </>
            )}
        </Modal>
    );
}
