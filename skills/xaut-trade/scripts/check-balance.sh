#!/usr/bin/env bash
# 查询测试链 USDT / XAUT 余额

WALLET_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
USDT=0xdAC17F958D2ee523a2206206994597C13D831ec7
XAUT=0x68749665FF8D2d112Fa859AA293F07a622782F38
RPC=http://127.0.0.1:8545

ETH=$(cast balance $WALLET_ADDRESS --rpc-url $RPC --ether)
USDT_RAW=$(cast call $USDT "balanceOf(address)" $WALLET_ADDRESS --rpc-url $RPC)
XAUT_RAW=$(cast call $XAUT "balanceOf(address)" $WALLET_ADDRESS --rpc-url $RPC)

USDT_VAL=$(cast --to-dec "$USDT_RAW")
XAUT_VAL=$(cast --to-dec "$XAUT_RAW")

echo "ETH  : $ETH"
printf "USDT : %.2f\n"  "$(echo "$USDT_VAL / 1000000" | bc -l)"
printf "XAUT : %.6f\n"  "$(echo "$XAUT_VAL / 1000000" | bc -l)"
