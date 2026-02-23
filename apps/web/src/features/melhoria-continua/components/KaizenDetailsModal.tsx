import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiEdit2, FiCheckSquare, FiSettings, FiImage } from 'react-icons/fi';
import Modal from '../../../shared/components/Modal';
import type { Kaizen } from '../../../types/api';
import styles from './KaizenDetailsModal.module.css';

interface KaizenDetailsModalProps {
    kaizen: Kaizen;
    onClose: () => void;
    onEdit: (k: Kaizen) => void;
    onAudit: (k: Kaizen) => void;
    onConfig: (k: Kaizen) => void;
    canEdit: boolean;
}

function formatDateBR(iso?: string | null): string {
    if (!iso) return '-';
    try {
        const d = new Date(iso);
        return d.toLocaleDateString('pt-BR');
    } catch {
        return iso;
    }
}

export default function KaizenDetailsModal({
    kaizen, onClose, onEdit, onAudit, onConfig, canEdit
}: KaizenDetailsModalProps) {
    const { t } = useTranslation();

    let statusDisplay = kaizen.status;
    if (statusDisplay === 'planejado') statusDisplay = 'Planejado';
    if (statusDisplay === 'em_andamento') statusDisplay = 'Em Andamento';
    if (statusDisplay === 'concluido') statusDisplay = 'Concluído';
    if (statusDisplay === 'padronizado') statusDisplay = 'Padronizado';

    return (
        <Modal isOpen={true} onClose={onClose} title="Detalhes do Kaizen">
            <div className={styles.container}>
                <div className={styles.imageHeader}>
                    {kaizen.thumbnail_url ? (
                        <img src={kaizen.thumbnail_url} alt={kaizen.titulo} className={styles.image} />
                    ) : (
                        <div className={styles.placeholderImg}>
                            <FiImage size={48} color="#94a3b8" />
                        </div>
                    )}
                </div>

                <div className={styles.content}>
                    <h2 className={styles.title}>{kaizen.titulo}</h2>
                    <div className={styles.badgeRow}>
                        <span className={styles.statusBadge}>{statusDisplay}</span>
                        <span className={styles.machineBadge}>{kaizen.maquina_nome || 'Geral'}</span>
                        <span className={styles.dateBadge}>Impl: {formatDateBR(kaizen.data_implementacao)}</span>
                    </div>

                    <div className={styles.sections}>
                        <div className={styles.sectionBox}>
                            <h4>Problema (Antes)</h4>
                            <p>{kaizen.problema_antes || 'Nenhuma descrição.'}</p>
                        </div>
                        <div className={styles.sectionBox}>
                            <h4>Solução (Depois)</h4>
                            <p>{kaizen.solucao_depois || 'Nenhuma descrição.'}</p>
                        </div>
                        <div className={styles.sectionBox}>
                            <h4>Ganhos / Impacto</h4>
                            <p>{kaizen.ganhos || 'Nenhuma descrição.'}</p>
                        </div>
                    </div>
                </div>

                <div className={styles.actions}>
                    {canEdit && (
                        <>
                            <button className={styles.btnSecondary} onClick={() => onConfig(kaizen)}>
                                <FiSettings size={16} /> Configurar
                            </button>
                            <button className={styles.btnPrimary} onClick={() => onEdit(kaizen)}>
                                <FiEdit2 size={16} /> Editar Kaizen
                            </button>
                        </>
                    )}
                    <button className={styles.btnSuccess} onClick={() => onAudit(kaizen)}>
                        <FiCheckSquare size={16} /> Auditar Kamishibai
                    </button>
                </div>
            </div>
        </Modal>
    );
}
