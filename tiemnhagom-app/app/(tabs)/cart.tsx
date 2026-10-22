// app/(tabs)/cart.tsx
import React from 'react';
import { Redirect } from 'expo-router';

export default function CartTabRedirect() {
  return <Redirect href="/cart" />;
}
