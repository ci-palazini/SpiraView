// src/features/producao/types/producao.ts

export interface ProducaoMeta {
    id: string;
    maquinaId: string;
    maquinaNome: string;
    maquinaTag?: string;
    dataInicio: string;
    dataFim?: string;
    horasMeta: number;
    criadoEm: string;
    atualizadoEm: string;
}

export interface ProducaoLancamento {
    id: string;
    maquinaId: string;
    maquinaNome: string;
    maquinaTag?: string;
    dataRef: string;
    turno?: '1º' | '2º';
    horasRealizadas: number;
    observacao?: string;
    lancadoPorNome?: string;
    uploadId?: string;
    criadoEm: string;
}

export interface ProducaoRendimento {
    maquinaId: string;
    maquinaNome: string;
    maquinaTag?: string;
    maquinaSetor?: string;
    dataRef: string;
    turno?: string;
    horasRealizadas: number;
    horasMeta: number;
    percentualAtingido?: number;
    statusMeta: 'sem_meta' | 'atingido' | 'parcial' | 'abaixo';
    lancadoPorNome?: string;
    criadoEm: string;
}

export interface ProducaoResumoDiario {
    maquinaId: string;
    maquinaNome: string;
    maquinaTag?: string;
    dataRef: string;
    horasDia: number;
    metaDia: number;
    percentualDia?: number;
    qtdLancamentos: number;
}

export interface ProducaoUpload {
    id: string;
    nomeArquivo: string;
    dataRef: string;
    linhasTotal: number;
    linhasSucesso: number;
    linhasErro: number;
    horasTotal: number;
    ativo: boolean;
    uploadPorNome?: string;
    criadoEm: string;
}

export interface MaquinaProducao {
    id: string;
    nome: string;
    tag?: string;
    setor?: string;
    critico?: boolean;
    escopo_manutencao: boolean;
    escopo_producao: boolean;
}
