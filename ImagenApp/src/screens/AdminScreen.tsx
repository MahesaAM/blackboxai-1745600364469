import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StackNavigationProp } from '@react-navigation/stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import { RootStackParamList } from '../../App';

type AdminScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, 'Admin'>;
};

type User = {
  username: string;
  password: string;
  expiresAt?: string;
};

const AdminScreen: React.FC<AdminScreenProps> = ({ navigation }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [bearerToken, setBearerToken] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const token = await AsyncStorage.getItem('token');
      if (token !== 'admin-token') {
        navigation.replace('Login');
      } else {
        fetchUsers();
        fetchBearerToken();
      }
    };
    checkAuth();
  }, []);

  const fetchUsers = async (search: string = '') => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search }),
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const fetchBearerToken = async () => {
    try {
      const res = await fetch('/api/admin/save-token');
      const data = await res.json();
      if (res.ok) {
        setBearerToken(data.bearerToken || '');
      } else {
        setError(data.error || 'Failed to fetch bearer token');
      }
    } catch (err) {
      setError('Error fetching bearer token');
    }
  };

  const handleSaveBearerToken = async () => {
    setError('');
    if (!bearerToken.trim()) {
      setError('Bearer token cannot be empty');
      return;
    }

    try {
      const res = await fetch('/api/admin/save-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bearerToken: bearerToken.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save bearer token');
      }
    } catch (err) {
      setError('Error saving bearer token');
    }
  };

  const handleEditUser = (user: User) => {
    setUsername(user.username);
    setPassword(user.password);
    setExpiresAt(user.expiresAt ? new Date(user.expiresAt) : null);
    setEditingUser(user);
    setError('');
  };

  const resetForm = () => {
    setUsername('');
    setPassword('');
    setExpiresAt(null);
    setEditingUser(null);
    setError('');
  };

  const handleAddOrUpdateUser = async () => {
    setError('');
    if (!username || !password) {
      setError('Username and password are required');
      return;
    }

    const user = {
      username,
      password,
      expiresAt: expiresAt?.toISOString(),
    };

    try {
      const endpoint = editingUser ? '/api/admin/update-user' : '/api/admin/create-user';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingUser ? { ...user, originalUsername: editingUser.username } : user),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save user');
      } else {
        fetchUsers(searchQuery);
        resetForm();
      }
    } catch (err) {
      setError('An unexpected error occurred');
    }
  };

  const handleDeleteUser = (usernameToDelete: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this user?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch('/api/admin/delete-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: usernameToDelete }),
              });

              if (res.ok) {
                fetchUsers(searchQuery);
              } else {
                const data = await res.json();
                setError(data.error || 'Failed to delete user');
              }
            } catch (err) {
              setError('An unexpected error occurred');
            }
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(['token', 'expiresAt']);
    navigation.replace('Login');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Admin User Management</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.formContainer}>
          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor="#666"
            value={username}
            onChangeText={setUsername}
            editable={!editingUser}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#666"
            value={password}
            onChangeText={setPassword}
          />
          
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.dateButtonText}>
              {expiresAt ? expiresAt.toLocaleDateString() : 'Select Expiry Date'}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={expiresAt || new Date()}
              mode="date"
              display="default"
              onChange={(event, date) => {
                setShowDatePicker(false);
                if (date) {
                  setExpiresAt(date);
                }
              }}
              minimumDate={new Date()}
            />
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleAddOrUpdateUser}
          >
            <Text style={styles.submitButtonText}>
              {editingUser ? 'Update User' : 'Add User'}
            </Text>
          </TouchableOpacity>

          {editingUser && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={resetForm}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.tokenContainer}>
          <TextInput
            style={styles.input}
            placeholder="BEARER_TOKEN"
            placeholderTextColor="#666"
            value={bearerToken}
            onChangeText={setBearerToken}
          />
          <TouchableOpacity
            style={styles.tokenButton}
            onPress={handleSaveBearerToken}
          >
            <Text style={styles.tokenButtonText}>Save BEARER_TOKEN</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.searchInput}
          placeholder="Search users..."
          placeholderTextColor="#666"
          value={searchQuery}
          onChangeText={(text) => {
            setSearchQuery(text);
            fetchUsers(text);
          }}
        />

        <View style={styles.userList}>
          {users.map((user) => (
            <View key={user.username} style={styles.userItem}>
              <View style={styles.userInfo}>
                <Text style={styles.username}>{user.username}</Text>
                <Text style={styles.expiry}>
                  Expires: {user.expiresAt ? new Date(user.expiresAt).toLocaleDateString() : '-'}
                </Text>
              </View>
              <View style={styles.userActions}>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => handleEditUser(user)}
                >
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteUser(user.username)}
                >
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {users.length === 0 && (
            <Text style={styles.emptyText}>No users found.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#18191F',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1C1E2B',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  formContainer: {
    backgroundColor: '#1C1E2B',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#2E3042',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    marginBottom: 12,
  },
  dateButton: {
    backgroundColor: '#2E3042',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  dateButtonText: {
    color: '#fff',
  },
  errorText: {
    color: '#ff4444',
    marginBottom: 12,
  },
  submitButton: {
    backgroundColor: '#3D7BFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#666',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    color: '#fff',
  },
  tokenContainer: {
    backgroundColor: '#1C1E2B',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  tokenButton: {
    backgroundColor: '#3D7BFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  tokenButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: '#2E3042',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    marginBottom: 16,
  },
  userList: {
    backgroundColor: '#1C1E2B',
    borderRadius: 8,
    overflow: 'hidden',
  },
  userItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2E3042',
  },
  userInfo: {
    flex: 1,
  },
  username: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 4,
  },
  expiry: {
    color: '#666',
    fontSize: 14,
  },
  userActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    backgroundColor: '#3D7BFF',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  editButtonText: {
    color: '#fff',
  },
  deleteButton: {
    backgroundColor: '#ff4444',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  deleteButtonText: {
    color: '#fff',
  },
  logoutButton: {
    backgroundColor: '#ff4444',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  logoutButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
    padding: 16,
  },
});

export default AdminScreen;
