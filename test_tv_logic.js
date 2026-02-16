
const historicoRaw = [
    { dataRef: '2023-10-27', hoursDia: 8, maquinaId: '1' }, // Friday
    { dataRef: '2023-10-28', hoursDia: 5, maquinaId: '1' }, // Saturday
    { dataRef: '2023-10-29', hoursDia: 4, maquinaId: '1' }, // Sunday (should be added to Saturday)
    { dataRef: '2023-10-30', hoursDia: 10, maquinaId: '1' }, // Monday

    { dataRef: '2023-11-04', hoursDia: 10, maquinaId: '1' }, // Saturday
    { dataRef: '2023-11-05', hoursDia: 12, maquinaId: '1' }, // Sunday (should NOT be added, > 10)
    { dataRef: '2023-11-06', hoursDia: 8, maquinaId: '1' }, // Monday
];

// Mock dependencies
const maquinaIdsDoScope = new Set(['1']);

// Original Logic Step 1: Group by date
const byDate = new Map();
for (const r of historicoRaw) {
    if (!maquinaIdsDoScope.has(r.maquinaId)) continue;
    const dt = r.dataRef;
    const curr = byDate.get(dt) || 0;
    byDate.set(dt, curr + (Number(r.hoursDia) || 0));
}

// Convert to array sorted by date
let days = Array.from(byDate.entries())
    .map(([iso, produzido]) => {
        const d = new Date(iso + 'T12:00:00');
        return {
            iso,
            produzido,
            day: d.getDay(), // 0 = Sunday, 6 = Saturday
        };
    })
    .sort((a, b) => a.iso.localeCompare(b.iso));

console.log('Before transformation:', days);

// NEW LOGIC TO IMPLEMENT
// Iterate carefully to handle day merging
// Note: We need to access previous day, so it helps if the array is sorted (it is).

const processedDays = [];
let pendingSaturdayIndex = -1;

for (let i = 0; i < days.length; i++) {
    const current = days[i];

    // Check if it's Saturday
    if (current.day === 6) {
        pendingSaturdayIndex = processedDays.length; // It will be pushed next
        processedDays.push({ ...current });
        continue;
    }

    // Check if it's Sunday
    if (current.day === 0) {
        // If we have a pending Saturday AND Sunday hours < 10
        if (pendingSaturdayIndex !== -1 && current.produzido < 10) {
            console.log(`Merging Sunday ${current.iso} (${current.produzido}h) into Saturday`);
            // Add hours to the pending Saturday
            processedDays[pendingSaturdayIndex].produzido += current.produzido;
            // Do NOT push Sunday to processedDays

            // Reset pendingSaturdayIndex prevents double merging if multiple Sundays appear (unlikely but safe)
            // But actually we might want to keep the Saturday index in case next day is also somehow Sunday? 
            // Standard calendar implies only one Sunday after Saturday.
            pendingSaturdayIndex = -1;
        } else {
            // Otherwise, keep Sunday as is
            processedDays.push({ ...current });
            // If Sunday is kept, it breaks the Saturday chain for future logic (though standard week resets anyway)
            pendingSaturdayIndex = -1;
        }
    } else {
        // Any other day
        processedDays.push({ ...current });
        // Reset pending Saturday unless we want to support long weekends logic? 
        // Logic says "agregadas no sábado", implies immediate adjacency.
        pendingSaturdayIndex = -1;
    }
}

console.log('After transformation:', processedDays);

// Verification
const sat1 = processedDays.find(d => d.iso === '2023-10-28');
const sun1 = processedDays.find(d => d.iso === '2023-10-29');

console.log('Test 1 (Sun < 10):');
console.log('Saturday 2023-10-28:', sat1.produzido, 'Expected: 9 (5+4)');
console.log('Sunday 2023-10-29 exists:', !!sun1, 'Expected: false');

const sat2 = processedDays.find(d => d.iso === '2023-11-04');
const sun2 = processedDays.find(d => d.iso === '2023-11-05');

console.log('Test 2 (Sun >= 10):');
console.log('Saturday 2023-11-04:', sat2.produzido, 'Expected: 10');
console.log('Sunday 2023-11-05 exists:', !!sun2, 'Expected: true');
console.log('Sunday 2023-11-05 hours:', sun2 ? sun2.produzido : 0, 'Expected: 12');

