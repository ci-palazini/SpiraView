import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronUp, FiChevronDown } from 'react-icons/fi';
import type { RankingDepartamento } from '@spiraview/shared';
import styles from './RankingDepartamentosTable.module.css';

interface RankingDepartamentosTableProps {
    data: RankingDepartamento[];
    onDepartmentClick: (departamentoId: string) => void;
}

type SortKey = 'departamentoNome' | 'totalObservacoes' | 'participantes' | 'compliance' | 'mediaObsPorParticipante';
type SortDirection = 'asc' | 'desc';

export default function RankingDepartamentosTable({ data, onDepartmentClick }: RankingDepartamentosTableProps) {
    const { t } = useTranslation();
    const [sortKey, setSortKey] = useState<SortKey>('compliance');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('desc');
        }
    };

    const sortedData = [...data].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        
        if (typeof aVal === 'string' && typeof bVal === 'string') {
            return sortDirection === 'asc' 
                ? aVal.localeCompare(bVal) 
                : bVal.localeCompare(aVal);
        }
        
        const aNum = Number(aVal) || 0;
        const bNum = Number(bVal) || 0;
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
    });

    const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
        if (sortKey !== columnKey) return null;
        return sortDirection === 'asc' ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />;
    };

    return (
        <div className={styles.container}>
            <h3 className={styles.title}>
                {t('ehs.stats.ranking_title', 'Ranking de Departamentos')}
            </h3>
            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.positionColumn}>#</th>
                            <th 
                                onClick={() => handleSort('departamentoNome')}
                            >
                                <div className={styles.sortableHeader}>
                                    {t('ehs.stats.departamento', 'Departamento')}
                                    <SortIcon columnKey="departamentoNome" />
                                </div>
                            </th>
                            <th 
                                onClick={() => handleSort('totalObservacoes')}
                            >
                                <div className={styles.sortableHeader}>
                                    {t('ehs.stats.total_obs', 'Total de Observações')}
                                    <SortIcon columnKey="totalObservacoes" />
                                </div>
                            </th>
                            <th 
                                onClick={() => handleSort('participantes')}
                            >
                                <div className={styles.sortableHeader}>
                                    {t('ehs.stats.participantes', 'Participantes')}
                                    <SortIcon columnKey="participantes" />
                                </div>
                            </th>
                            <th 
                                onClick={() => handleSort('compliance')}
                            >
                                <div className={styles.sortableHeader}>
                                    {t('ehs.stats.compliance', 'Compliance')}
                                    <SortIcon columnKey="compliance" />
                                </div>
                            </th>
                            <th 
                                onClick={() => handleSort('mediaObsPorParticipante')}
                            >
                                <div className={styles.sortableHeader}>
                                    {t('ehs.stats.media_obs', 'Média Obs/Participante')}
                                    <SortIcon columnKey="mediaObsPorParticipante" />
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedData.map((dept, idx) => (
                            <tr 
                                key={dept.departamentoId}
                                onClick={() => onDepartmentClick(dept.departamentoId)}
                                className={styles.clickableRow}
                            >
                                <td className={styles.positionCell}>{idx + 1}</td>
                                <td className={styles.deptNameCell}>{dept.departamentoNome}</td>
                                <td className={styles.numberCell}>{dept.totalObservacoes}</td>
                                <td className={styles.numberCell}>{dept.participantes}</td>
                                <td className={styles.complianceCell}>
                                    <div className={styles.complianceContent}>
                                        <span className={styles.complianceText}>
                                            {dept.compliance.toFixed(1)}%
                                        </span>
                                        <div className={styles.progressBar}>
                                            <div 
                                                className={styles.progressFill}
                                                style={{ 
                                                    width: `${Math.min(dept.compliance, 100)}%`,
                                                    backgroundColor: dept.compliance >= 80 ? '#10b981' : dept.compliance >= 50 ? '#f59e0b' : '#ef4444'
                                                }}
                                            />
                                        </div>
                                    </div>
                                </td>
                                <td className={styles.numberCell}>
                                    {dept.mediaObsPorParticipante.toFixed(1)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {data.length === 0 && (
                <div className={styles.emptyState}>
                    {t('ehs.stats.no_departments', 'Nenhum departamento com dados disponíveis.')}
                </div>
            )}
        </div>
    );
}
