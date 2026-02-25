// src/features/chamados/pages/AbrirChamadoManutentor.tsx
import { useEffect, useMemo, useState, useCallback, FormEvent, ChangeEvent } from "react";
import toast from "react-hot-toast";
import { FiPlusCircle, FiAlertTriangle } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { getMaquinas, criarChamado, listarChamadosPorMaquina } from "../../../../services/apiClient";
import styles from "./AbrirChamadoManutentor.module.css";
import type { User } from "../../../../App";
import usePermissions from "../../../../hooks/usePermissions";

interface Maquina {
    id: string;
    nome?: string;
}

interface MaquinaSugestao {
    label: string;
    value: string;
}

interface ChamadoAtivo {
    id: string;
    descricao?: string;
    status: string;
    criado_em?: string;
    maquina?: string;
}

interface AbrirChamadoManutentorProps {
    user: User;
}

function normalizeStatusKey(status: string | undefined): 'aberto' | 'emandamento' | 'concluido' | 'outro' {
    if (!status) return 'outro';
    const s = status.toLowerCase();
    if (s.includes('concluid')) return 'concluido';
    if (s.includes('andamento')) return 'emandamento';
    if (s.includes('abert')) return 'aberto';
    return 'outro';
}

export default function AbrirChamadoManutentor({ user }: AbrirChamadoManutentorProps) {
    const { t } = useTranslation();
    const perm = usePermissions(user);

    // Permite abrir se tiver permissão granular 'abrir_chamado' (ver ou editar)
    const podeAbrir = perm.canView('abrir_chamado');

    const [selectedMachineId, setSelectedMachineId] = useState("");
    const [descricao, setDescricao] = useState("");
    const [assumirAgora, setAssumirAgora] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [maquinas, setMaquinas] = useState<Maquina[]>([]);
    const [loading, setLoading] = useState(false);

    // Estado do modal de alerta de duplicatas
    const [showAlertaModal, setShowAlertaModal] = useState(false);
    const [pendingMachineId, setPendingMachineId] = useState("");
    const [checkingDuplicates, setCheckingDuplicates] = useState(false);
    const [chamadosAbertos, setChamadosAbertos] = useState<ChamadoAtivo[]>([]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const lista = await getMaquinas('', 'manutencao');
                setMaquinas(Array.isArray(lista) ? lista : []);
            } catch (e) {
                console.error(e);
                toast.error(t("techOpen.errors.loadMachines"));
            } finally {
                setLoading(false);
            }
        })();
    }, [t]);

    const sugestoesMaquinas = useMemo<MaquinaSugestao[]>(() => {
        const itens = maquinas.map((m) => {
            const nome = m?.nome ?? m?.id ?? "";
            return { label: nome, value: String(m?.id ?? "") };
        });
        return itens.sort((a, b) => a.label.localeCompare(b.label, "pt"));
    }, [maquinas]);

    /**
     * Ao selecionar uma máquina, verifica se há chamados corretivos ativos.
     * Se houver, exibe o modal de alerta antes de prosseguir.
     */
    const handleMachineChange = useCallback(async (e: ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        if (!id) {
            setSelectedMachineId("");
            return;
        }

        setCheckingDuplicates(true);
        try {
            const todosRaw = await listarChamadosPorMaquina(id, { tipo: 'corretiva' });
            // Normaliza para ChamadoAtivo (garante status como string)
            const todos: ChamadoAtivo[] = todosRaw.map((c) => ({
                id: c.id,
                descricao: c.descricao,
                status: c.status ?? 'Aberto',
                criado_em: (c as any).criado_em,
                maquina: c.maquina,
            }));
            // Filtra apenas os ativos (a API já garante tipo=corretiva)
            const ativos = todos.filter((c) => {
                const sk = normalizeStatusKey(c.status);
                return sk === 'aberto' || sk === 'emandamento';
            });

            if (ativos.length > 0) {
                setChamadosAbertos(ativos);
                setPendingMachineId(id);
                setShowAlertaModal(true);
            } else {
                setSelectedMachineId(id);
            }
        } catch (err) {
            // Em caso de erro na verificação, não bloqueia — apenas seleciona
            console.warn('[AbrirChamado] Erro ao verificar duplicatas:', err);
            setSelectedMachineId(id);
        } finally {
            setCheckingDuplicates(false);
        }
    }, []);

    const handleModalConfirm = useCallback(() => {
        setSelectedMachineId(pendingMachineId);
        setShowAlertaModal(false);
        setPendingMachineId("");
        setChamadosAbertos([]);
    }, [pendingMachineId]);

    const handleModalCancel = useCallback(() => {
        setShowAlertaModal(false);
        setPendingMachineId("");
        setChamadosAbertos([]);
        // Não aplica a seleção, select volta vazio
    }, []);

    const desabilitado =
        enviando || !podeAbrir || !selectedMachineId || descricao.trim().length < 5;

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (desabilitado || enviando) return;

        try {
            setEnviando(true);

            if (!selectedMachineId) {
                throw new Error(
                    t("techOpen.errors.invalidMachine", "Selecione uma máquina válida.")
                );
            }
            if (!user?.email) {
                throw new Error(
                    t("techOpen.errors.missingEmail", "Seu usuário não possui e-mail carregado.")
                );
            }
            if (!descricao || descricao.trim().length < 5) {
                throw new Error(
                    t("techOpen.errors.descriptionTooShort", "Descreva o problema (mín. 5 caracteres).")
                );
            }

            const maquinaSel = maquinas.find(
                (m) => String(m.id) === String(selectedMachineId)
            );
            if (!maquinaSel) {
                throw new Error(
                    t("techOpen.errors.machineNotInList", "Máquina não encontrada na lista local.")
                );
            }

            const assume = !!assumirAgora;

            const payload = {
                maquinaId: String(selectedMachineId),
                maquinaNome: maquinaSel?.nome || undefined,
                tipo: "corretiva" as const,
                descricao: descricao.trim(),
                status: assume ? "Em Andamento" : "Aberto",
                manutentorEmail: assume ? user.email : undefined,
                criadoPorEmail: user.email,
            };

            await criarChamado(payload, {
                role: user?.role || "manutentor",
                email: user?.email,
            });

            toast.success(t("techOpen.success.created"));
            setSelectedMachineId("");
            setDescricao("");
            setAssumirAgora(false);
        } catch (err) {
            console.error(err);
            toast.error((err as Error)?.message || t("techOpen.errors.create"));
        } finally {
            setEnviando(false);
        }
    };

    if (!podeAbrir) {
        return (
            <>
                <header className={styles.pageHeader}>
                    <h1 className={styles.pageTitle}>{t("techOpen.header.title")}</h1>
                </header>
                <div className={styles.listContainer}>
                    <p className={styles.helper}>{t("techOpen.noAccess")}</p>
                </div>
            </>
        );
    }

    return (
        <>
            {/* Modal de alerta: chamados corretivos já abertos */}
            {showAlertaModal && (
                <div className={styles.backdrop} onClick={(e) => e.target === e.currentTarget && handleModalCancel()}>
                    <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle} id="modal-titulo">
                                <FiAlertTriangle />
                                {t('operatorDashboard.modal.title')}
                            </h2>
                            <p className={styles.modalSubtitle}>
                                {chamadosAbertos.length === 1
                                    ? t('operatorDashboard.modal.subtitleOne')
                                    : t('operatorDashboard.modal.subtitleMany', { count: chamadosAbertos.length })}{' '}
                                {t('operatorDashboard.modal.question')}
                            </p>
                        </div>

                        <div className={styles.chamadosList}>
                            {chamadosAbertos.map((c) => {
                                const sk = normalizeStatusKey(c.status);
                                const badgeClass = sk === 'emandamento' ? styles.statusEmAndamento : styles.statusAberto;
                                const statusLabel = sk === 'emandamento' ? t('operatorDashboard.modal.inProgress') : t('operatorDashboard.modal.open');
                                return (
                                    <div key={c.id} className={styles.chamadoItem}>
                                        <div className={styles.chamadoInfo}>
                                            <div className={styles.chamadoDescricao} title={c.descricao || ''}>
                                                {c.descricao
                                                    ? (c.descricao.length > 80 ? c.descricao.slice(0, 80) + '…' : c.descricao)
                                                    : t('operatorDashboard.modal.noDescription')}
                                            </div>
                                            {c.criado_em && (
                                                <div className={styles.chamadoMeta}>
                                                    {t('operatorDashboard.modal.openedAt', { date: c.criado_em })}
                                                </div>
                                            )}
                                        </div>
                                        <span className={`${styles.statusBadge} ${badgeClass}`}>
                                            {statusLabel}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className={styles.modalFooter}>
                            <button type="button" className={styles.cancelBtn} onClick={handleModalCancel}>
                                {t('operatorDashboard.modal.cancel')}
                            </button>
                            <button type="button" className={styles.confirmBtn} onClick={handleModalConfirm}>
                                {t('operatorDashboard.modal.proceed')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <header className={styles.pageHeader}>
                <h1 className={styles.pageTitle}>{t("techOpen.header.title")}</h1>
            </header>

            <div className={styles.listContainer}>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.field}>
                        <label htmlFor="maquina" className={styles.label}>
                            {t("techOpen.fields.machine")}
                        </label>
                        <select
                            id="maquina"
                            className={styles.select}
                            value={selectedMachineId}
                            onChange={handleMachineChange}
                            required
                            disabled={loading || checkingDuplicates}
                        >
                            <option value="" disabled>
                                {loading || checkingDuplicates
                                    ? t("common.loading")
                                    : t("techOpen.placeholders.chooseMachine")}
                            </option>
                            {sugestoesMaquinas.map((m) => (
                                <option key={m.value} value={m.value}>
                                    {m.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="descricao" className={styles.label}>
                            {t("techOpen.fields.description")}
                        </label>
                        <textarea
                            id="descricao"
                            className={styles.textarea}
                            placeholder={t("techOpen.placeholders.description")}
                            value={descricao}
                            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDescricao(e.target.value)}
                            rows={5}
                            required
                        />
                    </div>

                    <div className={styles.inlineCheck}>
                        <label className={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={assumirAgora}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setAssumirAgora(e.target.checked)}
                            />
                            <span>{t("techOpen.fields.takeNow")}</span>
                        </label>
                        <small className={styles.helper}>
                            {t("techOpen.helper.takeNow")}
                        </small>
                    </div>

                    <div className={styles.actions}>
                        <button
                            type="submit"
                            className={styles.primaryBtn}
                            disabled={desabilitado}
                        >
                            <FiPlusCircle />
                            {enviando
                                ? t("techOpen.cta.sending")
                                : t("techOpen.cta.create")}
                        </button>
                    </div>
                </form>
            </div>
        </>
    );
}
