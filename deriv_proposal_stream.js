/**
 * Deriv Live Proposal Payout Implementation
 * App ID: 32FjINZV8sXfdKQcVvnZf
 * Client ID: 32FjINZV8sXfdKQcVvnZf
 * 
 * This script demonstrates the required logic for:
 * 1. Subscribing to live proposals with "subscribe": 1
 * 2. Parsing responses to update UI and save subscription IDs
 * 3. Handling input changes by closing old streams via "forget" before re-subscribing
 */

let currentSubscriptionId = null;
const ws = new WebSocket('wss://api.derivws.com/trading/v1/options/ws/public');

// 1. Subscribe to Live Proposals
function subscribeToLiveProposal(params) {
    const payload = {
        "proposal": 1,
        "subscribe": 1, // Crucial: initiates a continuous, real-time stream
        "basis": "stake",
        "amount": params.stake,
        "contract_type": params.contractType, // e.g., "CALL" or "PUT"
        "currency": params.currency || "USD",
        "duration": params.duration,
        "duration_unit": params.durationUnit || "m",
        "underlying_symbol": params.symbol // e.g., "R_100"
    };
    
    console.log('Sending Proposal Subscription Request:', payload);
    ws.send(JSON.stringify(payload));
}

// 2. Handle the WebSocket Response
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.error) {
        console.error('Deriv API Error:', data.error.message);
        return;
    }

    if (data.msg_type === 'proposal') {
        const proposal = data.proposal;
        
        // Extract and save the subscription id for future cancellation
        currentSubscriptionId = proposal.id;
        
        // Extract live payout – Deriv handles dashboard markup automatically for this App ID
        const livePayout = proposal.payout;
        
        // Update the HTML interface
        const displayElement = document.getElementById('payout-display');
        if (displayElement) {
            displayElement.innerText = `Live Payout: ${livePayout}`;
        }
        
        console.log(`Live Payout Updated: ${livePayout} (ID: ${currentSubscriptionId})`);
    }
    
    if (data.msg_type === 'forget') {
        console.log('Old proposal stream successfully closed.');
    }
};

// 3. Handle User Input Changes (Stake or Duration)
function onUserInputChanged(newParams) {
    console.log('User input changed. Managing stream transition...');

    // Crucial step: First send a request to the forget endpoint to close the existing stream
    if (currentSubscriptionId) {
        console.log(`Unsubscribing from old stream ID: ${currentSubscriptionId}`);
        ws.send(JSON.stringify({ "forget": currentSubscriptionId }));
        
        // Clear local reference to avoid duplicate forget calls
        currentSubscriptionId = null;
    }
    
    // Immediately execute the proposal function again to open a brand-new stream
    // with updated amount or duration parameters
    subscribeToLiveProposal(newParams);
}

// Example usage:
// onUserInputChanged({ stake: 10, duration: 5, symbol: 'R_100', contractType: 'CALL' });
