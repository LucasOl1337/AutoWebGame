# Oracle Cloud VM Deploy

Objetivo: rodar a versao atual do jogo em uma VM `Oracle Cloud Always Free` no Brasil para comparar latencia com `workers.dev`.

## Recomendado

- Regiao: `South America East (Sao Paulo)`
- SO: `Ubuntu 24.04`
- Shape gratis: `VM.Standard.A1.Flex` ou `E2.1.Micro`
- Porta da app: `8788`

## Abrir portas

No OCI, abra entrada para:

- `22/tcp`
- `8788/tcp`

## Deploy sem Docker

```bash
sudo apt update
sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

git clone <SEU_REPO> /opt/autowebgame
cd /opt/autowebgame
npm ci
npm run serve:oracle
```

Teste:

```bash
curl http://127.0.0.1:8788/health
```

URL publica:

```text
http://PUBLIC_IP:8788
```

## Deploy com Docker

```bash
sudo apt update
sudo apt install -y git docker.io
sudo systemctl enable --now docker

git clone <SEU_REPO> /opt/autowebgame
cd /opt/autowebgame
sudo docker build -f Dockerfile.oracle -t autowebgame-oracle .
sudo docker run -d --restart unless-stopped -p 8788:8788 --name autowebgame autowebgame-oracle
```

Teste:

```bash
curl http://127.0.0.1:8788/health
```

## systemd opcional

Crie `/etc/systemd/system/autowebgame.service`:

```ini
[Unit]
Description=AutoWebGame Oracle VM
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/autowebgame
Environment=HOST=0.0.0.0
Environment=PORT=8788
ExecStart=/usr/bin/npm run serve:oracle
Restart=always
User=ubuntu

[Install]
WantedBy=multi-user.target
```

Ative:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now autowebgame
sudo systemctl status autowebgame
```

## Observacao

Esta estrategia roda a app atual via `wrangler dev --local` dentro da VM. Isso preserva o backend autoritativo baseado em Worker/DO para o teste de latencia sem exigir uma reescrita imediata para Node puro.
