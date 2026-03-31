const TelegramBot = require('node-telegram-bot-api');

// --- MOCKS GLOBAIS ---

// Mock do Supabase
jest.mock('@supabase/supabase-js', () => {
    const mockQueryBuilder = {
        _lastTable: '',
        _isUpdate: false,
        select: jest.fn(function() { return this; }),
        eq: jest.fn(function() { return this; }),
        neq: jest.fn(function() { return this; }),
        ilike: jest.fn(function() { return this; }),
        limit: jest.fn(function() { return this; }),
        gt: jest.fn(function() { return this; }),
        order: jest.fn(function() { return this; }),
        update: jest.fn(function() { this._isUpdate = true; return this; }),
        then: jest.fn(function(onFulfilled) {
            const table = this._lastTable;
            const res = { error: null, data: [] };
            
            if (!this._isUpdate && table === 'players') {
                res.data = [{ riot_id: 'Test#BR1', telegram_id: null, role_raw: 'Duelista', unit: 'ALPHA', synergy_score: 100 }];
            }
            if (!this._isUpdate && table === 'active_calls') {
                res.data = [];
            }
            
            this._isUpdate = false; // Reset para próxima chamada
            return Promise.resolve(res).then(onFulfilled);
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

// Mock Express
const mockApp = {
    use: jest.fn(),
    post: jest.fn(),
    get: jest.fn(),
    listen: jest.fn((port, cb) => cb && cb()),
};
jest.mock('express', () => jest.fn(() => mockApp));

// Mock do Telegram Bot API
const mockBotInstance = {
    onText: jest.fn(),
    on: jest.fn(),
    sendMessage: jest.fn(),
    editMessageText: jest.fn(),
    editMessageReplyMarkup: jest.fn(),
    answerCallbackQuery: jest.fn(),
    setMyCommands: jest.fn(),
    deleteWebHook: jest.fn().mockResolvedValue(true),
    startPolling: jest.fn(),
    setWebHook: jest.fn(),
};

jest.mock('node-telegram-bot-api', () => {
    return jest.fn().mockImplementation(() => mockBotInstance);
});

// --- EXECUÇÃO DOS TESTES ---

describe('K.A.I.O. Telegram Bot - Unit Tests', () => {
    let botHandlers = {};

    beforeAll(() => {
        // Mock ENV
        process.env.TELEGRAM_BOT_TOKEN = 'test-token';
        process.env.SUPABASE_URL = 'https://test.supabase.co';
        process.env.SUPABASE_SERVICE_KEY = 'test-key';
        process.env.ADMIN_TELEGRAM_ID = '1104821838';
        process.env.HENRIK_API_KEY = 'test-henrik-key';
        process.env.NODE_ENV = 'test';

        // Silenciar logs mas permitir erros
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        // console.error mantido para debug
        
        // Mock Express
        const express = require('express');
        express.prototype.listen = jest.fn();

        // Carregar o bot
        require('../src/telegram-bot');

        // Capturar os handlers
        mockBotInstance.onText.mock.calls.forEach(([regex, handler]) => {
            botHandlers[regex.toString()] = handler;
        });

        mockBotInstance.on.mock.calls.forEach(([event, handler]) => {
            botHandlers[event] = handler;
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('Deveria registrar o menu de comandos ao iniciar', () => {
        expect(mockBotInstance.setMyCommands).toHaveBeenCalled();
    });

    test('Comando /start deveria enviar a mensagem de boas-vindas correta', async () => {
        const startHandler = botHandlers['/^\\/start(?:@[\\w_]+)?(?:\\s+(.*))?/'];
        expect(startHandler).toBeDefined();

        const msg = { chat: { id: 123 }, from: { id: 1104821838, first_name: 'Test' } };
        await startHandler(msg);

        expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(
            123, 
            expect.stringContaining('BEM-VINDO DE VOLTA'), 
            expect.any(Object)
        );
    });

    test('Comando /meu_id deveria identificar corretamente um administrador', () => {
        const meuidHandler = botHandlers['/^\\/meu_id(?:@[\\w_]+)?(?:\\s+|$)/'];
        expect(meuidHandler).toBeDefined();

        const msg = { chat: { id: 123 }, from: { id: 1104821838 } };
        meuidHandler(msg);

        expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(
            123, 
            expect.stringContaining('AUTORIZADO'), 
            expect.any(Object)
        );
    });

    test('Comando de Admin (/radar) deveria ser negado para usuários não autorizados', async () => {
        const radarHandler = botHandlers['/^\\/radar(?:@[\\w_]+)?(?:\\s+|$)/'];
        const msg = { chat: { id: 123 }, from: { id: 999 } }; // ID errado
        
        await radarHandler(msg);
        
        // Não deve enviar a mensagem de "Testando conexão..."
        expect(mockBotInstance.sendMessage).not.toHaveBeenCalledWith(123, expect.stringContaining('Testando conexão'), expect.any(Object));
    });

    test('Callback Query "cvc_" (Convocação) deveria extrair nome do comandante do rádio corretamente', async () => {
        const callbackHandler = botHandlers['callback_query'];
        expect(callbackHandler).toBeDefined();

        const query = {
            id: 'q123',
            from: { id: 1104821838 },
            data: 'cvc_no_ComandanteTeste',
            message: { chat: { id: 456 }, message_id: 789, text: 'texto' }
        };

        await callbackHandler(query);

        // Deve tentar editar a mensagem para indicar início da convocação
        expect(mockBotInstance.editMessageText).toHaveBeenCalledWith(
            expect.stringContaining('Iniciando chamada pública para o time'),
            expect.objectContaining({ chat_id: 456, message_id: 789 })
        );
    });

    test('Callback Query "uni_" (Unidade) deveria processar transferência tática', async () => {
        const callbackHandler = botHandlers['callback_query'];
        const query = {
            id: 'q124',
            from: { id: 1104821838 },
            data: 'uni_ALPHA_Test#BR1',
            message: { chat: { id: 456 }, message_id: 790 }
        };

        await callbackHandler(query);

        // Deve enviar mensagem de confirmação de transferência
        expect(mockBotInstance.sendMessage).toHaveBeenCalledWith(
            456,
            expect.stringContaining('Você agora faz parte do Esquadrão *ALPHA*'),
            expect.any(Object)
        );
    });

    test('Callback Query "uni_cancel" deveria abortar transferência tática', async () => {
        const callbackHandler = botHandlers['callback_query'];
        const query = {
            id: 'q125',
            from: { id: 1104821838 },
            data: 'uni_cancel',
            message: { chat: { id: 456 }, message_id: 791 }
        };

        await callbackHandler(query);

        expect(mockBotInstance.editMessageText).toHaveBeenCalledWith(
            expect.stringContaining('mantivemos sua equipe atual'),
            expect.any(Object)
        );
    });

    test('Callback Query "cvc_cancel" deveria abortar convocação', async () => {
        const callbackHandler = botHandlers['callback_query'];
        const query = {
            id: 'q126',
            from: { id: 1104821838 },
            data: 'cvc_cancel',
            message: { chat: { id: 456 }, message_id: 792 }
        };

        await callbackHandler(query);

        expect(mockBotInstance.editMessageText).toHaveBeenCalledWith(
            expect.stringContaining('Cancelado. Estou por aqui'),
            expect.any(Object)
        );
    });
});
