// src/components/OperatorLoginForm.tsx
import { useState, useEffect, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, User, Loader } from 'lucide-react';
import { listarOperadoresAtivos, loginOperador, OperadorListItem } from '../services/apiClient';
import toast from 'react-hot-toast';
import { SelectList, NumericKeypad } from '../shared/components';
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
    const [keypadOpen, setKeypadOpen] = useState(false);

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

    const handleSubmit = async (e?: FormEvent<HTMLFormElement>) => {
        e?.preventDefault();
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

    const handleKeypadConfirm = () => {
        setKeypadOpen(false);
        if (selectedId && matricula.length === 4) {
            handleSubmit();
        }
    };

    // Converter operadores para formato do SelectList
    const operadorOptions = operadores.map((op) => ({
        id: op.id,
        label: op.nome,
    }));

    // Display da matrícula como ****
    const matriculaDisplay = matricula.length > 0 ? '●'.repeat(matricula.length) : '';

    return (
        <div className={styles.container}>
            <button type="button" className={styles.backButton} onClick={onBack}>
                <ArrowLeft size={16} />
                {t('login.operatorMode.backToNormal', 'Voltar para login normal')}
            </button>

            <div className={styles.header}>
                <User className={styles.headerIcon} />
                <h2 className={styles.title}>
                    {t('login.operatorMode.title', 'Acesso Operador')}
                </h2>
            </div>

            {loading ? (
                <div className={styles.loadingContainer}>
                    <Loader className={styles.spinner} size={24} />
                    <span>{t('login.operatorMode.loading', 'Carregando operadores...')}</span>
                </div>
            ) : operadores.length === 0 ? (
                <div className={styles.emptyMessage}>
                    {t('login.operatorMode.empty', 'Nenhum operador cadastrado.')}
                </div>
            ) : (
                <form onSubmit={handleSubmit} className={styles.form}>
                    <SelectList
                        label={t('login.operatorMode.selectOperator', 'Selecione seu nome')}
                        options={operadorOptions}
                        value={selectedId}
                        onChange={setSelectedId}
                        searchable={operadores.length > 6}
                        searchPlaceholder={t('login.operatorMode.searchPlaceholder', 'Buscar operador...')}
                        emptyMessage={t('login.operatorMode.noResults', 'Nenhum operador encontrado')}
                        disabled={submitting}
                    />

                    <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>
                            {t('login.operatorMode.matricula', 'Matrícula (4 dígitos)')}
                        </label>
                        <button
                            type="button"
                            className={`${styles.matriculaButton} ${matricula.length > 0 ? styles.hasDots : ''}`}
                            onClick={() => setKeypadOpen(true)}
                            disabled={submitting}
                        >
                            {matriculaDisplay || t('login.operatorMode.matriculaPlaceholder', 'Toque para digitar')}
                        </button>
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

            <NumericKeypad
                isOpen={keypadOpen}
                onClose={() => setKeypadOpen(false)}
                value={matricula}
                onChange={setMatricula}
                onConfirm={handleKeypadConfirm}
                maxLength={4}
                title={t('login.operatorMode.matricula', 'Matrícula (4 dígitos)')}
            />
        </div>
    );
}
