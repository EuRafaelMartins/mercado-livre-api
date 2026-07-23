const express = require('express');
const cookieParser = require('cookie-parser');

const app = express();
app.use(cookieParser());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ML_CLIENT_ID = process.env.ML_CLIENT_ID || '';
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET || '';
const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI || 'http://localhost:3000/callback';
const SYNC_TOKEN = process.env.SYNC_TOKEN || '';

console.log('Iniciando servidor...');
console.log('PORT:', PORT);
console.log('ML_REDIRECT_URI:', ML_REDIRECT_URI);
console.log('ML_CLIENT_ID:', ML_CLIENT_ID ? 'Configurado' : 'NAO configurado');

function getToken(req) {
    const raw = req.cookies && req.cookies.ml_token;
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

let serverToken = null;

function saveServerToken(tokenData) {
    serverToken = Object.assign({}, tokenData, { obtained_at: Date.now() });
}

async function refreshServerToken() {
    if (!serverToken || !serverToken.refresh_token) return null;
    try {
        const response = await fetch('https://api.mercadolibre.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: ML_CLIENT_ID,
                client_secret: ML_CLIENT_SECRET,
                refresh_token: serverToken.refresh_token
            }).toString()
        });
        if (!response.ok) return null;
        const data = await response.json();
        saveServerToken(data);
        return serverToken;
    } catch (e) {
        return null;
    }
}

async function getValidServerToken() {
    if (!serverToken) return null;
    const ageSeconds = (Date.now() - serverToken.obtained_at) / 1000;
    if (ageSeconds > (serverToken.expires_in - 300)) {
        return await refreshServerToken();
    }
    return serverToken;
}

app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/', (req, res) => {
    const token = getToken(req);
    const authenticated = !!token;
    res.send(`<!DOCTYPE html>
    <html>
    <head>
    <title>Mercado Livre API</title>
    <style>
    body { font-family: Arial, sans-serif; background: linear-gradient(135deg,#667eea,#764ba2); min-height:100vh; margin:0; display:flex; align-items:center; justify-content:center; }
    .card { background:#fff; border-radius:16px; padding:40px; max-width:500px; width:100%; box-shadow:0 10px 40px rgba(0,0,0,.2); }
    h1 { text-align:center; }
    .status { padding:12px 16px; border-radius:8px; margin-bottom:20px; }
    .ok { background:#e6ffed; border-left:4px solid #22c55e; }
    .err { background:#ffeef0; border-left:4px solid #ef4444; }
    .btn { display:block; width:100%; text-align:center; padding:14px; border-radius:8px; text-decoration:none; color:#fff; font-weight:bold; margin-bottom:12px; background:linear-gradient(135deg,#667eea,#764ba2); border:none; cursor:pointer; }
    h2 { color:#5b4b8a; }
    .endpoints { background:#f3f4f6; border-radius:8px; padding:16px; font-family:monospace; font-size:14px; }
    </style>
    </head>
    <body>
    <div class="card">
    <h1>Mercado Livre API</h1>
    <div class="status ${authenticated ? 'ok' : 'err'}">
    ${authenticated ? '&#9989; Conectado (User ID: ' + token.user_id + ')' : '&#10060; Nao conectado - Faca login primeiro'}
    </div>
    <h2>Autenticacao</h2>
    ${authenticated
      ? '<a class="btn" href="/logout">Desconectar</a>'
      : '<a class="btn" href="/auth/login">Conectar ao Mercado Livre</a>'}
      <h2>Funcionalidades</h2>
      <a class="btn" href="/products">Ver Meus Produtos</a>
      <a class="btn" href="/orders">Ver Meus Pedidos</a>
      <h2>Endpoints API</h2>
      <div class="endpoints">
      GET /auth/login - Pagina de autenticacao<br>
      GET /callback - Retorno da autenticacao<br>
      GET /products - Listar produtos<br>
      GET /orders - Listar pedidos<br>
      GET /logout - Desconectar<br>
      POST /webhook - Receber notificacoes<br>
      POST /api/sheet-sync - Sincronizar planilha (protegido por token)<br>
      GET /health - Status da API
      </div>
      </div>
      </body>
      </html>`);
});

app.get('/auth/login', (req, res) => {
    const state = Math.random().toString(36).substring(2, 10);
    const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${ML_CLIENT_ID}&redirect_uri=${encodeURIComponent(ML_REDIRECT_URI)}&state=${state}`;
    res.send(`<!DOCTYPE html>
    <html>
    <head>
    <title>Conectar ao Mercado Livre</title>
    <style>
    body { font-family: Arial, sans-serif; background: linear-gradient(135deg,#667eea,#764ba2); min-height:100vh; margin:0; display:flex; align-items:center; justify-content:center; }
    .card { background:#fff; border-radius:16px; padding:40px; max-width:500px; width:100%; box-shadow:0 10px 40px rgba(0,0,0,.2); }
    .btn { display:block; width:100%; text-align:center; padding:14px; border-radius:8px; text-decoration:none; color:#fff; font-weight:bold; margin-bottom:12px; background:linear-gradient(135deg,#667eea,#764ba2); }
    .btn2 { display:block; width:100%; text-align:center; padding:14px; border-radius:8px; text-decoration:none; color:#333; font-weight:bold; margin-bottom:12px; background:#eee; }
    .info { background:#f3f4f6; border-radius:8px; padding:16px; margin-top:20px; }
    </style>
    </head>
    <body>
    <div class="card">
    <h1>Conectar ao Mercado Livre</h1>
    <p>Clique no botao abaixo para autorizar sua aplicacao a acessar sua conta do Mercado Livre.</p>
    <a class="btn" href="${authUrl}">Autorizar com Mercado Livre</a>
    <a class="btn2" href="/">Voltar</a>
    <div class="info">
    <strong>Debug Info:</strong><br>
    Client ID: ${ML_CLIENT_ID ? 'Configurado' : 'NAO configurado'}<br>
    Redirect URI: ${ML_REDIRECT_URI}
    </div>
    </div>
    </body>
    </html>`);
});

async function handleCallback(req, res) {
    const code = req.query.code || (req.body && req.body.code);
    if (!code) {
        return res.status(400).send('Codigo de autorizacao ausente.');
    }
    console.log('Callback recebido! Trocando codigo por token...');
    try {
        const response = await fetch('https://api.mercadolibre.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: ML_CLIENT_ID,
                client_secret: ML_CLIENT_SECRET,
                code: code,
                redirect_uri: ML_REDIRECT_URI
            }).toString()
        });

    console.log('Response status:', response.status);

    if (!response.ok) {
        const errorData = await response.text();
        console.error('Erro do ML:', errorData);
        return res.status(500).send('Erro ao trocar codigo por token: ' + errorData);
    }

    const tokenData = await response.json();
        saveServerToken(tokenData);
        res.cookie('ml_token', JSON.stringify(tokenData), { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 30 });
        res.send(`<!DOCTYPE html>
        <html>
        <head>
        <title>Autenticacao Bem-Sucedida</title>
        <script>setTimeout(function(){ window.location.href = '/'; }, 2000);</script>
        <style>body{font-family:Arial,sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center;}
        .card{background:#fff;border-radius:16px;padding:40px;max-width:500px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.2);}</style>
        </head>
        <body>
        <div class="card">
        <h1>Autenticacao Bem-Sucedida!</h1>
        <p>Voce foi autenticado com sucesso no Mercado Livre! Redirecionando...</p>
        <p><strong>User ID:</strong> ${tokenData.user_id}</p>
        </div>
        </body>
        </html>`);
    } catch (err) {
        console.error('Erro no callback:', err);
        res.status(500).send(`<!DOCTYPE html>
        <html>
        <head><title>Erro de Autenticacao</title></head>
        <body>
        <h1>Erro ao Autenticar</h1>
        <p>${err.message}</p>
        <a href="/auth/login">Tentar Novamente</a> | <a href="/">Voltar para Inicio</a>
        </body>
        </html>`);
    }
}

app.get('/callback', handleCallback);
app.post('/callback', handleCallback);

app.get('/products', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Nao autenticado. Acesse /auth/login primeiro.' });
    try {
        const response = await fetch(`https://api.mercadolibre.com/users/${token.user_id}/items/search?access_token=${token.access_token}`);
        if (!response.ok) throw new Error('Erro ao buscar produtos: ' + response.status);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/products', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Nao autenticado. Acesse /auth/login primeiro.' });
    try {
        const response = await fetch(`https://api.mercadolibre.com/items?access_token=${token.access_token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/orders', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Nao autenticado. Acesse /auth/login primeiro.' });
    try {
        const response = await fetch(`https://api.mercadolibre.com/orders/search?seller=${token.user_id}&access_token=${token.access_token}`);
        if (!response.ok) throw new Error('Erro ao buscar pedidos: ' + response.status);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/webhook', (req, res) => {
    console.log('Webhook recebido:', JSON.stringify(req.body));
    res.status(200).json({ received: true });
});

app.get('/logout', (req, res) => {
    res.clearCookie('ml_token');
    res.redirect('/');
});

function requireSyncToken(req, res, next) {
    const provided = req.headers['x-sync-token'];
    if (!SYNC_TOKEN || provided !== SYNC_TOKEN) {
        return res.status(401).json({ error: 'Token de sincronizacao invalido ou ausente.' });
    }
    next();
}

async function fetchItemSheetData(code, accessToken) {
    const itemRes = await fetch(`https://api.mercadolibre.com/items/${code}?access_token=${accessToken}`);
    if (!itemRes.ok) throw new Error('Anuncio nao encontrado (' + itemRes.status + ')');
    const item = await itemRes.json();

const skuAttr = (item.attributes || []).find(a => a.id === 'SELLER_SKU');
    const sku = item.seller_custom_field || (skuAttr && skuAttr.value_name) || '';

let visits30d = 0;
    try {
        const visitsRes = await fetch(`https://api.mercadolibre.com/items/${code}/visits/time_window?last=30&unit=day&access_token=${accessToken}`);
        if (visitsRes.ok) {
            const visitsData = await visitsRes.json();
            visits30d = visitsData.total_visits || 0;
        }
    } catch (e) {}

let commissionPercent = 0;
    let commissionValue = 0;
    try {
        const priceRes = await fetch(`https://api.mercadolibre.com/sites/MLB/listing_prices?price=${item.price}&listing_type_id=${item.listing_type_id}&category_id=${item.category_id}&access_token=${accessToken}`);
        if (priceRes.ok) {
            const priceData = await priceRes.json();
            const entry = Array.isArray(priceData) ? priceData[0] : priceData;
            if (entry && entry.sale_fee_amount != null) {
                commissionValue = entry.sale_fee_amount;
                commissionPercent = item.price ? (commissionValue / item.price) * 100 : 0;
            }
        }
    } catch (e) {}

let promoPercent = 0;
    let promoRebate = 0;
    let priceWithPromo = item.price;
    try {
        const promoRes = await fetch(`https://api.mercadolibre.com/seller-promotions/items/${code}?app_version=v2&access_token=${accessToken}`);
        if (promoRes.ok) {
            const promoData = await promoRes.json();
            const promos = Array.isArray(promoData) ? promoData : (promoData.results || []);
            const active = promos.find(p => p.status === 'started' || p.status === 'active');
            if (active) {
                priceWithPromo = active.deal_price != null ? active.deal_price : (active.price != null ? active.price : item.price);
                promoRebate = item.price - priceWithPromo;
                promoPercent = item.price ? (promoRebate / item.price) * 100 : 0;
            }
        }
    } catch (e) {}

let shippingCost = 0;
    try {
        const shipRes = await fetch(`https://api.mercadolibre.com/items/${code}/shipping_options?access_token=${accessToken}`);
        if (shipRes.ok) {
            const shipData = await shipRes.json();
            const opt = (shipData.options || [])[0];
            if (opt) shippingCost = opt.list_cost != null ? opt.list_cost : (opt.cost != null ? opt.cost : 0);
        }
    } catch (e) {}

const soldTotal = item.sold_quantity || 0;

return {
    titulo: item.title,
    sku: sku,
    estoque: item.available_quantity,
    status: item.status,
    exposicao: item.listing_type_id,
    vendas: soldTotal,
    visitas: visits30d,
    conversao: visits30d ? (soldTotal / visits30d) * 100 : 0,
    preco_base: item.price,
    preco_com_oferta: priceWithPromo,
    promo_percent: promoPercent,
    promo_rebate: promoRebate,
    comissao_percent: commissionPercent,
    comissao_valor: commissionValue,
    mercado_envios: shippingCost,
    logistic_type: (item.shipping && item.shipping.logistic_type) || ''
};
}

app.post('/api/sheet-sync', requireSyncToken, async (req, res) => {
    const token = await getValidServerToken();
    if (!token) {
        return res.status(401).json({ error: 'A API ainda nao esta autenticada no Mercado Livre neste servidor. Acesse a pagina inicial e faca login pelo menos uma vez.' });
    }
    const codes = Array.isArray(req.body.codes) ? req.body.codes.filter(Boolean) : [];
    if (codes.length === 0) {
        return res.status(400).json({ error: 'Nenhum codigo de anuncio informado.' });
    }

         const results = {};
    for (const code of codes) {
        try {
            results[code] = await fetchItemSheetData(code, token.access_token);
        } catch (err) {
            results[code] = { error: err.message };
        }
    }
    res.json({ results: results });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Started server: http://0.0.0.0:${PORT}`);
});
