/**
 * Script per generare la documentazione PDF
 * Usa npx md-to-pdf per semplicità
 */
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🚀 Generazione documentazione PDF in corso...');

try {
    // Usa npx per eseguire md-to-pdf direttamente
    const docPath = path.join(__dirname, '..', 'DOCUMENTAZIONE_TECNICA.md');
    const command = `npx md-to-pdf "${docPath}"`;
    
    execSync(command, { stdio: 'inherit' });
    
    console.log('✅ PDF generato con successo!');
    console.log('📄 File: DOCUMENTAZIONE_TECNICA.pdf');
    
} catch (error) {
    console.error('❌ Errore nella generazione del PDF:', error.message);
    console.log('💡 Per generare il PDF manualmente:');
    console.log('   npx md-to-pdf DOCUMENTAZIONE_TECNICA.md');
}
