import assert from 'node:assert/strict';
import test from 'node:test';
import { suggestEmail } from './emailTypo';

test('common provider misspellings get a suggestion', () => {
  assert.equal(suggestEmail('amarachiblessin3141@gmail.cm'), 'amarachiblessin3141@gmail.com');
  assert.equal(suggestEmail('ada@gmial.com'), 'ada@gmail.com');
  assert.equal(suggestEmail('ada@gamil.com'), 'ada@gmail.com');
  assert.equal(suggestEmail('ada@gmail.con'), 'ada@gmail.com');
  assert.equal(suggestEmail('ada@gmail.co'), 'ada@gmail.com');
  assert.equal(suggestEmail('ada@yaho.com'), 'ada@yahoo.com');
  assert.equal(suggestEmail('ada@hotmial.com'), 'ada@hotmail.com');
  assert.equal(suggestEmail('ada@outlok.com'), 'ada@outlook.com');
  assert.equal(suggestEmail('ada@icloud.cm'), 'ada@icloud.com');
  assert.equal(suggestEmail(' Ada@GMAIL.CM '), 'Ada@gmail.com');
});

test('correct and unknown addresses are left alone', () => {
  for (const email of ['ada@gmail.com', 'ada@yahoo.co.uk', 'ada@yahoo.fr', 'ada@company.cm', 'ada@karwan.site', 'ada@proton.me', 'ada@mail.com', 'ada@gmx.de', 'not-an-email', '', 'ada@']) {
    assert.equal(suggestEmail(email), null, email);
  }
});

test('a made-up domain ending in .con still gets the .com fix', () => {
  assert.equal(suggestEmail('ada@company.con'), 'ada@company.com');
});
