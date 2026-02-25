// src/features/calendario/components/CalendarGrid.tsx
import React, { useState, useMemo, useCallback, DragEvent } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import styles from './CalendarGrid.module.css';

export interface CalendarEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    status: 'agendado' | 'iniciado' | 'concluido';
    isOverdue?: boolean;
    isToday?: boolean;
    color?: string;
}

interface CalendarGridProps {
    events: CalendarEvent[];
    onDayClick?: (date: Date) => void;
    onEventClick?: (event: CalendarEvent) => void;
    onEventDrop?: (eventId: string, newDate: Date) => void;
    canEdit?: boolean;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function getEventColor(event: CalendarEvent): string {
    if (event.color) return event.color;
    if (event.status === 'concluido') return '#3b82f6'; // azul
    if (event.status === 'iniciado') return '#059669'; // verde escuro
    if (event.isOverdue) return '#ef4444'; // vermelho
    if (event.isToday) return '#f59e0b'; // laranja
    return '#22c55e'; // verde claro
}

export default function CalendarGrid({
    events,
    onDayClick,
    onEventClick,
    onEventDrop,
    canEdit = true
}: CalendarGridProps) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [draggedEvent, setDraggedEvent] = useState<CalendarEvent | null>(null);

    // Navegação
    const goToPrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
    const goToNextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const goToToday = () => setCurrentDate(new Date());

    // Calculando dias do calendário
    const calendarDays = useMemo(() => {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart, { locale: ptBR });
        const endDate = endOfWeek(monthEnd, { locale: ptBR });

        const days: Date[] = [];
        let day = startDate;
        while (day <= endDate) {
            days.push(day);
            day = addDays(day, 1);
        }
        return days;
    }, [currentDate]);

    // Eventos por dia
    const eventsByDay = useMemo(() => {
        const map: Record<string, CalendarEvent[]> = {};
        events.forEach(event => {
            const key = format(event.start, 'yyyy-MM-dd');
            if (!map[key]) map[key] = [];
            map[key].push(event);
        });
        return map;
    }, [events]);

    // Drag handlers
    const handleDragStart = useCallback((e: DragEvent, event: CalendarEvent) => {
        if (!canEdit) return;
        setDraggedEvent(event);
        e.dataTransfer.effectAllowed = 'move';
    }, [canEdit]);

    const handleDragOver = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    const handleDrop = useCallback((e: DragEvent, targetDate: Date) => {
        e.preventDefault();
        if (draggedEvent && onEventDrop) {
            onEventDrop(draggedEvent.id, targetDate);
        }
        setDraggedEvent(null);
    }, [draggedEvent, onEventDrop]);

    const handleDayClick = useCallback((date: Date) => {
        if (canEdit && onDayClick) {
            onDayClick(date);
        }
    }, [canEdit, onDayClick]);

    const today = new Date();

    return (
        <div className={styles.container}>
            {/* Header com navegação */}
            <div className={styles.header}>
                <div className={styles.navButtons}>
                    <button
                        className={styles.navButton}
                        onClick={goToToday}
                    >
                        Hoje
                    </button>
                    <button
                        className={styles.navButton}
                        onClick={goToPrevMonth}
                        aria-label="Mês anterior"
                    >
                        <FiChevronLeft />
                    </button>
                    <button
                        className={styles.navButton}
                        onClick={goToNextMonth}
                        aria-label="Próximo mês"
                    >
                        <FiChevronRight />
                    </button>
                </div>

                <h2 className={styles.monthTitle}>
                    {format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}
                </h2>

                <div className={styles.spacer} />
            </div>

            {/* Grid do calendário */}
            <div className={styles.gridScrollWrapper}>
                <div className={styles.calendarGrid}>
                    {/* Dias da semana */}
                    {WEEKDAYS.map(day => (
                        <div key={day} className={styles.weekdayHeader}>
                            {day}
                        </div>
                    ))}

                    {/* Dias do mês */}
                    {calendarDays.map((day, index) => {
                        const dayKey = format(day, 'yyyy-MM-dd');
                        const dayEvents = eventsByDay[dayKey] || [];
                        const isCurrentMonth = isSameMonth(day, currentDate);
                        const isToday = isSameDay(day, today);

                        return (
                            <div
                                key={index}
                                className={`${styles.dayCell} ${!isCurrentMonth ? styles.otherMonth : ''} ${isToday ? styles.today : ''}`}
                                onClick={() => handleDayClick(day)}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, day)}
                            >
                                <span className={styles.dayNumber}>
                                    {format(day, 'd')}
                                </span>

                                <div className={styles.eventsContainer}>
                                    {dayEvents.slice(0, 3).map(event => (
                                        <div
                                            key={event.id}
                                            className={styles.event}
                                            style={{ backgroundColor: getEventColor(event) }}
                                            draggable={canEdit}
                                            onDragStart={(e) => handleDragStart(e, event)}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEventClick?.(event);
                                            }}
                                            title={event.title}
                                        >
                                            {event.title}
                                        </div>
                                    ))}
                                    {dayEvents.length > 3 && (
                                        <div className={styles.moreEvents}>
                                            +{dayEvents.length - 3} mais
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
