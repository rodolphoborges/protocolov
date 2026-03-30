const updater = require('../src/update-data');
const matchMock = require('./mocks/match-vr.json');

// Mock do Supabase
jest.mock('@supabase/supabase-js', () => {
  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockImplementation(() => Promise.resolve({ error: null })),
    insert: jest.fn().mockImplementation(() => Promise.resolve({ error: null })),
    // Implementação do Thenable para o await funcionar
    then: jest.fn(function(onFulfilled) {
      // Determinar o que retornar com base na última tabela chamada
      const table = this._lastTable;
      if (table === 'players') {
        return Promise.resolve({
          data: [
            { riot_id: 'AgenteA#BR1', synergy_score: 10, lone_wolf: false, unit: 'ALPHA', dm_score: 0, dm_score_monthly: 0, dm_score_total: 0 },
            { riot_id: 'AgenteB#BR1', synergy_score: 5, lone_wolf: false, unit: 'OMEGA', dm_score: 0, dm_score_monthly: 0, dm_score_total: 0 }
          ],
          error: null
        }).then(onFulfilled);
      }
      if (table === 'operations') {
        return Promise.resolve({ data: [], error: null }).then(onFulfilled);
      }
      return Promise.resolve({ data: [], error: null }).then(onFulfilled);
    })
  };

  return {
    createClient: jest.fn(() => ({
      from: jest.fn((table) => {
        mockQueryBuilder._lastTable = table;
        return mockQueryBuilder;
      })
    }))
  };
});

// Mock do Axios (REST Bridge para Oráculo-V)
jest.mock('axios', () => ({
  post: jest.fn(() => Promise.resolve({
    data: {
      success: true,
      insight: {
        rank: 'Omega',
        score: 85,
        resumo: 'Análise simulada por Mock (Ambiente de Teste)',
        model_used: 'JestMock'
      },
      technical_data: { rounds: 5 }
    }
  }))
}));

// Mock do Fetch (API HenrikDev + Telegram)
global.fetch = jest.fn((url) => {
  if (url.includes('matches')) {
    return Promise.resolve({
      status: 200,
      json: () => Promise.resolve(matchMock)
    });
  }
  return Promise.resolve({ 
    status: 200, 
    json: () => Promise.resolve({}),
    headers: { get: () => '30' } 
  });
});

// Aumentar timeout global para o teste (mesmo com mocks, o processamento pode demorar)
jest.setTimeout(15000);

describe('Motor de Sinergia do Protocolo V (E2E Shadow Test)', () => {
  beforeAll(() => {
    // Silenciar console.log mas manter console.error para debug
    jest.spyOn(console, 'log').mockImplementation(() => {});
    // jest.spyOn(console, 'error').mockImplementation(() => {}); // Comentado para ver o erro
    
    // Imperativo: Mocar process.exit para o Jest não morrer
    jest.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`Process.exit called with code ${code}`);
    });
    
    // Mock das variáveis de ambiente
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'test-key';
    process.env.HENRIK_API_KEY = 'test-api-key';
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
    process.env.TELEGRAM_CHAT_ID = 'test-chat-id';
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test('Deve calcular corretamente 2 pontos de Sinergia para uma vitória em DUO', async () => {
    // IMPORTANTE: Mocar o delay interno para o teste não demorar 13s por player
    const updaterMod = require('../src/update-data');
    
    // Tentativa de mocar o delay injetado ou no escopo (como é local, vamos mocar o timer)
    jest.useFakeTimers();
    
    const { createClient } = require('@supabase/supabase-js');
    const mockClient = createClient();
    const upsertSpy = mockClient.from('players').upsert;

    // Executa o motor (como usamos fake timers, precisamos avançar o tempo se houver await delay)
    const runPromise = updater.run();
    
    // Avança todos os timers repetidamente até a promise resolver
    for(let i=0; i<50; i++) {
        jest.advanceTimersByTime(30000);
        await Promise.resolve(); // Permite que microtasks (promises) rodem
    }

    await runPromise;

    // Verifica se o upsert foi chamado
    expect(upsertSpy).toHaveBeenCalled();

    // Verifica os dados enviados para o Supabase
    const upsertedPlayers = upsertSpy.mock.calls[0][0];
    
    const playerA = upsertedPlayers.find(p => p.riot_id === 'AgenteA#BR1');
    const playerB = upsertedPlayers.find(p => p.riot_id === 'AgenteB#BR1');

    // AgenteA tinha 10, ganhou 2 (duo vitória) -> deve ter 12
    expect(playerA.synergy_score).toBe(12);
    // AgenteB tinha 5, ganhou 2 -> deve ter 7
    expect(playerB.synergy_score).toBe(7);
    
    // Verifica se as flags de erro foram falsas
    expect(playerA.api_error).toBe(false);
  });
});
