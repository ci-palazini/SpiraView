// src/components/OperatorLoginForm.tsx
import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArrowLeft, FiUser, FiLoader } from 'react-icons/fi';
import { listarOperadoresAtivos, loginOperador, OperadorListItem } from '../services/apiClient';
import toast from 'react-hot-toast';
import styles from './OperatorLoginForm.module.css';

interface OperatorLoginFormProps {
    onSuccess: (user: { id: string; nome: string; email: string; role: string }) => void;
    onBack: () => void;
}

export default function OperatorLoginForm({ onSuccess, onBack }: OperatorLoginFormProps) {
    const { t } = useTranslation();

    const [operadores, setOperadores] = useState<OperadorListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState('');
    const [matricula, setMatricula] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Carregar lista de operadores
    useEffect(() => {
        async function load() {
            try {
                const list = await listarOperadoresAtivos();
                setOperadores(list);
            } catch (err) {
                console.error('Erro ao carregar operadores:', err);
                toast.error(t('login.operatorMode.loadError', 'Erro ao carregar operadores.'));
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [t]);

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (submitting) return;

        if (!selectedId) {
            toast.error(t('login.operatorMode.selectRequired', 'Selecione um operador.'));
            return;
        }

        if (!matricula || matricula.length < 4) {
            toast.error(t('login.operatorMode.matriculaRequired', 'Digite sua matrícula (4 dígitos).'));
            return;
        }

        setSubmitting(true);

        try {
            const user = await loginOperador(selectedId, matricula);
            onSuccess({
                id: user.id,
                nome: user.nome,
                email: user.email,
                role: user.role
            });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Erro no login';
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    // Formatar matrícula: apenas dígitos, máximo 4
    const handleMatriculaChange = (e: ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/\D/g, '').slice(0, 4);
        setMatricula(value);
    };

    return (
        <div className={styles.container}>
            <button type="button" className={styles.backButton} onClick={onBack}>
                <FiArrowLeft />
                {t('login.operatorMode.backToNormal', 'Voltar para login normal')}
            </button>

            <div className={styles.header}>
                <FiUser className={styles.headerIcon} />
                <h2 className={styles.title}>
                    {t('login.operatorMode.title', 'Acesso Operador')}
                </h2>
            </div>

            {loading ? (
                <div className={styles.loadingContainer}>
                    <FiLoader className={styles.spinner} />
                    <span>{t('login.operatorMode.loading', 'Carregando operadores...')}</span>
                </div>
            ) : operadores.length === 0 ? (
                <div className={styles.emptyMessage}>
                    {t('login.operatorMode.empty', 'Nenhum operador cadastrado.')}
                </div>
            ) : (
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.fieldGroup}>
                        <label htmlFor="operador" className={styles.fieldLabel}>
                            {t('login.operatorMode.selectOperator', 'Selecione seu nome')}
                        </label>
                        <select
                            id="operador"
                            className={styles.select}
                            value={selectedId}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedId(e.target.value)}
                            disabled={submitting}
                        >
                            <option value="">
                                {t('login.operatorMode.selectPlaceholder', 'Escolha...')}
                            </option>
                            {operadores.map((op) => (
                                <option key={op.id} value={op.id}>
                                    {op.nome}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.fieldGroup}>
                        <label htmlFor="matricula" className={styles.fieldLabel}>
                            {t('login.operatorMode.matricula', 'Matrícula (4 dígitos)')}
                        </label>
                        <input
                            type="password"
                            id="matricula"
                            className={styles.input}
                            value={matricula}
                            onChange={handleMatriculaChange}
                            placeholder={t('login.operatorMode.matriculaPlaceholder', 'Digite sua matrícula')}
                            maxLength={4}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            disabled={submitting}
                            autoComplete="off"
                        />
                    </div>

                    <button
                        type="submit"
                        className={styles.submitButton}
                        disabled={submitting || !selectedId || matricula.length < 4}
                    >
                        {submitting
                            ? t('login.operatorMode.submitting', 'Entrando...')
                            : t('login.operatorMode.enter', 'Entrar')}
                    </button>
                </form>
            )}
        </div>
    );
}
