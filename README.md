# FSShowdown（FSSh）

『Full Stride』プレイヤー主導型・疑似ランクマッチツール

> FS Showdown（誰よりも疾くゴール）せよ

## 概要

Full Strideには公式のオンラインランクマッチ機能が存在しない。馬の能力差・コース適性の偏りを均一化した専用対戦用シートを用い、プレイヤー自身の展開読み・操作の技量だけを測る対戦環境を提供する。

- 対戦形式：タイマン（1対1）限定
- マッチング・レート計算・結果反映を完全自動化
- 距離別・脚質別勝率を統計として公開

## 構成

- Cloudflare Pages（静的サイト）
- Durable Objects（マッチング状態管理）
- D1（プレイヤー・対戦履歴・レートデータ）

## 姉妹ツール

- [FSScreener](https://jiz41.github.io/FSScreener/)
- [FSSplicer](https://fssplicer.pages.dev/)
- [FSstriders](https://jiz41.github.io/FSstriders/)
