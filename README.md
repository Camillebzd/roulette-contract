# roulette contract

Roulette project in which user swaps XTZ for a random token using roulette. Contains the contract part.

## Setup

Run:
```
npm install
```

Create a `.env` file following the `.env.example` file example.

## Deploy

To deploy the contract (choose between etherlink and etherlinkTestnet):
```
npx hardhat ignition deploy ignition/modules/Roulette.ts --network <etherlinkTestnet | etherlink> --verify
```

## Spin

You can try to spin by running:
```
npx hardhat run scripts/spin.ts --network <etherlinkTestnet | etherlink>
```