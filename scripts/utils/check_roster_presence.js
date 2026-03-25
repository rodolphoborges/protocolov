require('dotenv').config();
const { supabase } = require('../../src/db');

const matchPlayers = [
    'WhatsApp#Iza',
    'm4sna#chama',
    'important706foot#706',
    'asura#6442',
    'Magobruko#1550',
    'ayra#908',
    'H1T#6236',
    'Fusi0n da NuBank#Lindo',
    'DefeitoDeFábrica#ZzZ',
    'Quero um amigo#Elden',
    'Clkalec#CEC',
    'FamousLastWords#077',
    'Protagonista#tordo',
    'DavizinnTX#1111',
    'GuStAvO#8660',
    's9mkz#011',
    'é o mister aura#NTC',
    'Smolder Gael#Raarw',
    'Abbadon#BR2',
    'KGW KILLER#75390',
    'Pilako#3186',
    'RatoEpico#2215',
    'zoirtorto#1212',
    'raliudi#br1',
    'Tali#085',
    'vidoca#1828'
];

async function checkRoster() {
    const { data: players, error } = await supabase.from('players').select('riot_id');
    if (error) {
        console.error('Error fetching players:', error);
        return;
    }

    const roster = new Set(players.map(p => p.riot_id.toLowerCase().trim()));
    console.log('--- Roster Presence ---');
    matchPlayers.forEach(mp => {
        if (roster.has(mp.toLowerCase().trim())) {
            console.log(`[YES] ${mp}`);
        }
    });

    console.log('\n--- Full Roster ---');
    console.log(players.map(p => p.riot_id).join(', '));
}

checkRoster();
