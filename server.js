import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import morgan from 'morgan';
import indexRoutes from './routes/index.js';
import { initDb, getDb } from './config/database.js';
import expressLayouts from 'express-ejs-layouts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inizializza l'app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(expressLayouts);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main');

// Middleware per verificare la connessione al database
app.use((req, res, next) => {
    try {
        getDb(); // Verifica che il database sia accessibile
        next();
    } catch (err) {
        console.error('Errore accesso database nella richiesta:', err);
        res.status(500).send('Errore di connessione al database');
    }
});

// Routes
app.use('/', indexRoutes);

// Inizializza il database prima di avviare il server
(async function() {
    try {
        // Usa una versione semplificata dell'inizializzazione per isolare il problema
        console.log('Inizializzazione database semplificata...');
        const db = getDb();

        // Verifica connessione valida
        await new Promise((resolve, reject) => {
            db.get('SELECT 1', (err, result) => {
                if (err) {
                    console.error('Errore verifica connessione:', err);
                    reject(err);
                } else {
                    console.log('Connessione al database verificata');
                    resolve(result);
                }
            });
        });

        // Inizializza completamente il database (crea tabelle e configura)
        await initDb();

        // Avvia il server con logica di retry se la porta è in uso
        function startServer(port) {
            const srv = app.listen(port, () => {
                console.log(`Server avviato su http://localhost:${port}`);
            });
            srv.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.warn(`Porta ${port} in uso, riprovo con porta ${port + 1}`);
                    startServer(port + 1);
                } else {
                    throw err;
                }
            });
        }
        startServer(PORT);
    } catch (err) {
        console.error('Errore inizializzazione database:', err);
        process.exit(1);
    }
})();