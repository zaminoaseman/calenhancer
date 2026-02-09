// Test the Streaming iCal Logic
import { ICalLineUnfolder, ICalLineEnhancer } from './src/ical-parser.js';
import fs from 'fs';

// Helper to simulate the stream
async function runTest() {
    console.log('🧪 Starting Streaming Parser Test...\n');

    const rawInput = fs.readFileSync('test-calendar.ics', 'utf-8');
    // Add some Emoji and Folded lines for testing
    const testInput = rawInput
        .replace('SUMMARY:Computer Security', 'SUMMARY:🔒 k_BCS_008 - Computer Security 💻') // Emoji + Prefix
        .replace('DESCRIPTION:', 'DESCRIPTION:This is a very long folded line that \r\n should be unfolded properly.'); // Fold

    const encoder = new TextEncoder();
    const unfolder = new ICalLineUnfolder();
    const enhancer = new ICalLineEnhancer();

    // Mock Controller
    const results = [];
    const controller = {
        enqueue: (chunk) => {
            results.push(new TextDecoder().decode(chunk));
        }
    };

    // Simulate Chunks (split arbitrarily to test boundary handling)
    const chunkSize = 50;
    const inputBytes = encoder.encode(testInput);

    for (let i = 0; i < inputBytes.length; i += chunkSize) {
        const chunk = inputBytes.slice(i, i + chunkSize);
        await unfolder.processChunk(chunk, controller, enhancer);
    }
    unfolder.flush(controller, enhancer);

    const fullOutput = results.join('');

    // --- Verification Checks --- //
    const checks = [
        { name: 'Prefix Removed from Summary', pass: fullOutput.includes('SUMMARY:Computer Security') && !fullOutput.match(/SUMMARY:.*k_BCS_008/) },
        { name: 'Unfolding Worked', pass: !fullOutput.includes('folded line that \r\n should') },
        { name: 'Folding Applied to Output', pass: fullOutput.includes('\r\n ') }, // Should have some folded long lines
        { name: 'SHED Wi-Fi Notes Removed', pass: !fullOutput.includes('Wi-Fi: SRH Campus Network') },
        { name: 'CUBE Format is 1.03-CUBE', pass: fullOutput.includes('1.03-CUBE') }, // Assuming test file has "CUBE 1.03"
        { name: 'Apple Geo Tag Present', pass: fullOutput.includes('X-APPLE-STRUCTURED-LOCATION') },
        { name: 'Exact GPS for SHED C', pass: fullOutput.includes('52.4760266,13.4549741') },
        { name: 'No Plus Code in Visual Location', pass: !fullOutput.includes('GCC5+RX Berlin') },
        { name: 'Description: Course ID First', pass: fullOutput.includes('🆔 Course ID: k_BCS_008') },
        { name: 'Online Location Cleaned', pass: fullOutput.includes('LOCATION:Online') && !fullOutput.includes('Online - Online') }
    ];

    console.log('--- Results ---');
    let allPass = true;
    for (const c of checks) {
        if (c.pass) console.log(`✅ ${c.name}`);
        else {
            console.log(`❌ ${c.name}`);
            allPass = false;
        }
    }

    if (!allPass) {
        console.log('\n❌ FAILED. Debug Output Snippet:');
        console.log(fullOutput.substring(0, 500));
        process.exit(1);
    } else {
        console.log('\n✅ All Streaming Tests Passed!');
    }
}

runTest().catch(e => {
    console.error(e);
    process.exit(1);
});
