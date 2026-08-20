# OCR Test Fixtures

Всеки тестов документ живее в собствена папка `doc-NNN/`. Папката съдържа снимки на талона и файл `expected.json` с очакваните стойности.

Фикстурите не се версионират в repo-то (реални документи → лични данни). Директорията е празна по подразбиране; `pytest` просто не колектира тестове, докато няма поне един `doc-NNN/`.

---

## Структура на папката

```
tests/fixtures/
  doc-001/
    step1.jpg          ← страница собственик / MRZ зона   (step=1)
    step1b.jpg         ← алтернативна снимка на същата страница  (step=1)
    step2.jpg          ← страница идентичност на МПС            (step=2)
    step3.jpg          ← страница технически данни               (step=3)
    expected.json      ← ground truth за всички стъпки
  doc-002/
    ...
```

### Правила за именуване

| Файл | Стъпка | Описание |
|---|---|---|
| `step1.jpg` | 1 | Основна снимка — страницата с MRZ линиите и собственика |
| `step1b.jpg`, `step1c.jpg`, ... | 1 | Алтернативни снимки (различен ъгъл, осветление) |
| `step2.jpg` | 2 | Страница с рег. номер, VIN, марка, модел |
| `step3.jpg` | 3 | Страница с двигател, гориво, места |

- Номерът в `step1`/`step2`/`step3` определя към кой ендпойнт да се изпрати снимката (`?step=1/2/3`)
- Буквата след цифрата означава алтернативна снимка — тества се срещу същия `expected.json`
- Ако дадена стъпка няма снимка, тя се пропуска автоматично
- Ако в `expected.json` липсва ключ за стъпката, тя се пропуска

---

## Формат на `expected.json`

```json
{
  "description": "Четимо описание — марка/модел, без собственик",
  "step1": {
    "vin":                "WVWZZZ1JZXW000000",
    "registrationNumber": "CA0000AA",
    "ownerLastName":      null,
    "ownerFirstName":     null,
    "ownerMiddleName":    null,
    "egn":                null
  },
  "step2": {
    "registrationNumber": "CA0000AA",
    "vin":                "WVWZZZ1JZXW000000",
    "make":               "VOLKSWAGEN",
    "model":              "VOLKSWAGEN GOLF"
  },
  "step3": {
    "engine": "1984",
    "fuel":   "PETROL",
    "seats":  5
  }
}
```

### Правила за стойностите

| Тип | Как се сравнява | Пример |
|---|---|---|
| String | Case-insensitive, normalize whitespace | `"CA0000AA"` == `"ca0000aa"` |
| Integer | Точно числово равенство | `5` == `5` |
| `null` | Полето се **пропуска** — не се асъртва | Използвай за полета, трудни за четене, или PII (`ownerName`, `egn`) |
| Липсващ ключ | Полето се **пропуска** | Не трябва да включваш всички полета |

**Не попълвай реални имена/ЕГН в `expected.json` дори локално с намерение да ги commit-неш** — тези полета остават `null`, тества се само екстракцията на VIN/рег. номер/марка/модел.

---

## Добавяне на нов тест документ

```bash
mkdir branivo-ocr/tests/fixtures/doc-NNN
cp ~/Downloads/photo_mrz.jpg   branivo-ocr/tests/fixtures/doc-NNN/step1.jpg
cp ~/Downloads/photo_front.jpg branivo-ocr/tests/fixtures/doc-NNN/step2.jpg
cp ~/Downloads/photo_tech.jpg  branivo-ocr/tests/fixtures/doc-NNN/step3.jpg
cp branivo-ocr/tests/fixtures/doc-001/expected.json branivo-ocr/tests/fixtures/doc-NNN/expected.json
# редактирай expected.json с реалните VIN/рег.номер/марка/модел от документа
pytest branivo-ocr/tests/ -k doc-NNN -v
```

Виж какво реално извлича OCR-ът (без да асъртваш нищо):

```bash
curl -s -X POST "http://localhost:8888/ocr/talon?step=1&debug=true" \
  -F "file=@branivo-ocr/tests/fixtures/doc-NNN/step1.jpg" \
  | python3 -m json.tool
```

## Полезни команди

```bash
make ocr-test                                    # всички тестове
pytest branivo-ocr/tests/ -k doc-001 -v           # само един документ
pytest branivo-ocr/tests/ -k "confidence" -v      # само confidence тестовете
pytest branivo-ocr/tests/ -k "fields" -v          # само field тестовете
pytest branivo-ocr/tests/ --api-url http://staging.branivo.bg:8888 -v
make ocr-rebuild && make ocr-test
```
