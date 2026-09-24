import { configure } from '@testing-library/react-native';

// En frío, la primera pantalla tarda en cargar: los findBy esperan hasta 10 s.
configure({ asyncUtilTimeout: 10_000 });
