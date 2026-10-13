# Excluded diagnostics

The final five-pair rerun contains 20 valid captures and is the only basis for the summary. A prior, unpaired `candidate-mobile-3.json` from the earlier native comparison had nine `net::ERR_NETWORK_CHANGED` failed asset requests; it is kept here and excluded from all claims. It is an earlier candidate-vs-native run, not part of the final bundled-auth-fallback comparison.

The first bundled control attempt stopped before browser measurement because the candidate fixture server was not listening (connection refused). The owner restarted the read-only server and reran the full set. There is no browser capture for that attempt, so it contributes no result.
