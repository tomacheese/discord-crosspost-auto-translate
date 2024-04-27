function doPost(e) {
  let parameter = {}
  try {
    parameter = JSON.parse(e.postData.contents)
  } catch {
    return ContentService.createTextOutput({
      status: false,
      result: 'Invalid JSON',
    }).setMimeType(ContentService.MimeType.JSON)
  }
  let before = parameter.before
  if (before == 'auto') before = ''
  const after = parameter.after
  const mode =
    ('mode' in parameter && parameter.mode == 'html') ||
    parameter.text.includes('<span translate="no">')
      ? 'html'
      : 'text'
  let status
  let text
  try {
    if (mode == 'text') {
      text = LanguageApp.translate(parameter.text, before, after)
    } else {
      const temporary = parameter.text.replaceAll('\n', '<br>')
      text = LanguageApp.translate(temporary, before, after, {
        contentType: 'html',
      })
      text = text.replaceAll('<br>', '\n')
      text = unescape(text)
    }
    status = true
  } catch (error) {
    text = '' + error
    status = false
  }
  const result = {}
  result.status = status
  result.result = text
  result.text = parameter.text

  const response = JSON.stringify({ request: parameter, response: result })

  return ContentService.createTextOutput(response).setMimeType(
    ContentService.MimeType.JSON
  )
}

function unescape(target) {
  if (typeof target !== 'string') return target

  const patterns = {
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#x27;': "'",
    '&#x60;': '`',
  }

  return target.replaceAll(/&(lt|gt|amp|quot|#x27|#x60);/g, function (match) {
    return patterns[match]
  })
}
