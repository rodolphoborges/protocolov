const { supabase } = require('./db');

async function checkColumns() {
    const { data, error } = await supabase
        .from('players')
        .select('*')
        .limit(1);

    if (error) {
        console.error("Erro:", error);
    } else if (data && data.length > 0) {
        console.log("Colunas encontradas:", Object.keys(data[0]).join(', '));
    } else {
        console.log("Nenhum dado para verificar colunas.");
    }
}

checkColumns();
