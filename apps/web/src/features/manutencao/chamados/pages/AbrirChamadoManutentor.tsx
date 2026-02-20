// src/features/chamados/pages/AbrirChamadoManutentor.tsx
import { useEffect, useMemo, useState, FormEvent, ChangeEvent } from "react";
import toast from "react-hot-toast";
import { FiPlusCircle } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { getMaquinas, criarChamado } from "../../../../services/apiClient";
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

interface AbrirChamadoManutentorProps {
    user: User;
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
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedMachineId(e.target.value)}
                            required
                            disabled={loading}
                        >
                            <option value="" disabled>
                                {loading
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
