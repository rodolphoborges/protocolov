require('dotenv').config();
const fetchMatches = async (p) => {
    const [name, tag] = p.split('#');
    try {
        const url = `https://api.henrikdev.xyz/valorant/v3/matches/br/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`;
        const res = await fetch(url, { headers: { 'Authorization': process.env.HENRIK_API_KEY } });
        const json = await res.json();
        return json.data || [];
    } catch (e) {
        return [];
    }
};

(async () => {
    const p1 = 'PDL CH1TUZ#666';
    const p2 = 'ALEGRIA#021';
    const m1 = await fetchMatches(p1);
    const m2 = await fetchMatches(p2);
    const ids1 = m1.map(m => m.metadata?.matchid);
    const ids2 = m2.map(m => m.metadata?.matchid);
    console.log('PDL:', ids1);
    console.log('ALEGRIA:', ids2);
    console.log('Overlap:', ids1.filter(id => ids2.includes(id)));
})();
